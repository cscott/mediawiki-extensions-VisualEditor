/*!
 * VisualEditor DataModel Transaction transposition.
 *
 * @copyright 2011-2013 VisualEditor Team and others; see AUTHORS.txt
 * @license The MIT License (MIT); see LICENSE.txt
 */
( function ( ve ) {

	/* Private helper functions */

	/*
	 * Create a marker element, which we'll use to "cross out" removed
	 * items without changing list indexes.  Later, we can use the
	 * `isNotDeleted` function to filter out the marked elements.
	 */
	var DELETED = { deleted: true };

	/*
	 * Helper function: return true unless `el` is `DELETED`.
	 */
	function isNotDeleted( el ) {
		return el !== DELETED;
	}

	/*
	 * Position data type.
	 *
	 * Maintain position within data/metadata.  Conceptually, metadata
	 * positions precede data positions, so that the data at offset
	 * `n` occurs at position `(n, MAX_INT)`.
	 */
	function Position(dataPos, metadataPos) {
		this.data = dataPos || 0;
		this.meta = metadataPos || 0;
	}
	Position.prototype.add = function( d, m ) {
		if ( d instanceof Position ) {
			return this.add( d.data, d.meta );
		}
		if ( d === 0 ) {
			return new Position( this.data, this.meta + ( m || 0 ) );
		}
		return new Position( this.data + d, ( m || 0 ) );
	};
	Position.prototype.subtract = function( d, m ) {
		if ( d instanceof Position ) {
			return this.subtract( d.data, d.meta );
		}
		return this.add( -d, -m );
	};
	Position.prototype.lt = function( d, m ) {
		if ( d instanceof Position ) {
			return this.lt( d.data, d.meta );
		}
		if ( this.data === d ) {
			return this.meta < ( m || 0 );
		}
		return this.data < d;
	};
	Position.prototype.toString = function() {
		return 'Position('+this.data+','+this.meta+')';
	};

	/*
	 * Helper function for `transposeOne()`.
	 *
	 * We preprocess transactions' operation lists to annotate them with
	 * old position information and mutable insert/remove lists.  We
	 * call the result a 'map'.
	 */
	function mkMap( tx ) {
		var r = [], oldPos = new Position( 0, 0 ), j, meta, inMeta = false;
		// start with sentinel
		r.push( {
			op: { type: 'retain', length: 1 },
			correction: new Position( -1 ),
			start: new Position( -1 )
		} );
		$.each( tx.operations, function( i, op ) {
			var m = {
				op: op,
				start: oldPos
			};
			switch ( op.type ) {

			case 'retain':
				m.correction = new Position( 0 );
				if ( inMeta ) {
					inMeta = false;
					// add sentinel covering "data after metadata" realignment
					m.start = oldPos.add( 1 );
					m.correction = new Position( -1 );
					r.push( {
						op: { type: 'retainData' },
						start: oldPos,
						correction: new Position( 0 )
					} );
					if ( op.length === 1 ) {
						oldPos = m.start;
						return;
					}
				}
				oldPos = oldPos.add( op.length );
				break;

			case 'replace':
				if ( inMeta ) {
					throw new Error( 'replace at unaligned position' );
				}
				// combine data and metadata
				m.remove = [];
				meta = ( op.removeMetadata === undefined ) ? [] : op.removeMetadata;
				for ( j = 0; j < op.remove.length; j++ ) {
					m.remove.push( [ meta[ j ], op.remove[ j ] ] );
				}
				m.insert = [];
				meta = ( op.insertMetadata === undefined ) ? [] : op.insertMetadata;
				for ( j = 0; j < op.insert.length; j++ ) {
					m.insert.push( [ meta[ j ], op.insert[ j ] ] );
				}
				oldPos = oldPos.add( op.remove.length );
				break;

			case 'replaceMetadata':
				if ( !inMeta ) {
					inMeta = true;
					// add sentinel
					r.push( {
						op: { type: 'retainMetadata', length: 1 },
						correction: new Position( 0, -1 ),
						start: oldPos.subtract( 0, 1 )
					} );
				}
				m.remove = op.remove.slice( 0 );
				m.insert = op.insert.slice( 0 );
				oldPos = oldPos.add( 0, op.remove.length );
				break;

			case 'retainMetadata':
				if ( !inMeta ) {
					inMeta = true;
					// add sentinel
					r.push( {
						op: { type: 'retainMetadata', length: 1 },
						correction: new Position( 0, -1 ),
						start: oldPos.subtract( 0, 1 )
					} );
				}
				m.correction = new Position( 0 );
				oldPos = oldPos.add( 0, op.length );
				break;

			default:
				throw new Error( 'unhandled type: ' + op.type );
			}
			r.push( m );
		} );
		// add sentinel at end
		r.push( {
			op: { type: 'retain', length: 1 },
			correction: new Position( -1 ),
			start: oldPos,
			end: oldPos.add( 1 )
		} );
		// link up 'start' and 'end' fields
		$.each( r, function( i, op ) {
			if ( i < r.length - 1 ) {
				op.end = r[ i + 1 ].start;
			}
		} );
		return r;
	}

	/*
	 * Helper function: change insert/remove to replace/insert.
	 */
	function mkReplaceExtra( insert, remove, preferB ) {
		var delItems, extraItems;
		// slice handles the case where remove.length < insert.length fine.
		delItems = insert.slice( 0, remove.length );
		while ( delItems.length < remove.length ) {
			if ( preferB ) {
				delItems.push( DELETED );
			} else {
				delItems.unshift( DELETED );
			}
		}
		extraItems = insert.slice( remove.length );
		return { replace: delItems, extra: extraItems };
	}

	/*
	 * Helper function: count common prefix/suffix.
	 */
	function countCommonPrefixSuffix( a, b ) {
		var i, j, r = [];
		for ( i = 0 ; i < 2; i++ ) {
			j = 0;
			while (
				j < a.length && j < b.length &&
				ve.compare( a[ j ], b[ j ] )
			) {
				j++;
			}
			r.push( j );
			a.reverse();
			b.reverse();
		}
		return r;
	}

	/*
	 * Helper function: split replace/insert.
	 */
	function pushReplaceMerged( tx, remove, insert ) {
		var cnt, i, r;
		// optimize insert/remove sets in A (avoid removing then reinserting)
		cnt = countCommonPrefixSuffix( remove, insert );
		tx.pushRetain( cnt[ 0 ] ); // common prefix length
		r = { remove: [], removeMetadata: [], insert: [], insertMetadata: [] };
		for ( i = cnt[ 0 ]; i + cnt[ 1 ] < remove.length ; i++ ) {
			r.removeMetadata.push( remove[ i ][ 0 ] );
			r.remove.push( remove[ i ][ 1 ] );
		}
		for ( i = cnt[ 0 ]; i + cnt[ 1 ] < insert.length ; i++ ) {
			r.insertMetadata.push( insert[ i ][ 0 ] );
			r.insert.push( insert[ i ][ 1 ] );
		}
		if ( ve.compare( r.removeMetadata, new Array( r.remove.length ) ) &&
			 ve.compare( r.insertMetadata, new Array( r.insert.length ) )
		   ) {
			r.removeMetadata = r.insertMetadata = undefined;
		}
		tx.pushReplaceInternal(
			r.remove, r.insert, r.removeMetadata, r.insertMetadata
		);
		tx.pushRetain( cnt[ 1 ] ); // common suffix length
	}

	/*
	 * Helper function for `transpose()`.
	 *
	 * Transposing `a` by `b` is almost the same as transposing `b` by `a`; we just
	 * break some ties in opposite ways to ensure the results are consistent.
	 * So we define `transposeOne` here, and then call it twice to create the
	 * full `transpose` result.
	 */
	function transposeOne( aMap, bMap, preferB ) {
		// preferB means insert extraItems *before* pos
		// !preferB means insert extraItems *after* pos-1
		var r, i, j, k, aOp, bOp, insPos, items, lookup, pos, cnt;
		// go through operations in b, applying them to a.
		// Do this in reverse order so that we avoid changing the offsets
		// of operations we haven't yet processed.
		j = aMap.length - 1;
		lookup = function( pos ) {
			// find the location in aMap corresponding to pos
			while ( j >= 0 && pos.lt( aMap[ j ].start ) ) {
				j--;
			}
		};

		for ( i = bMap.length - 1; i >= 0; i-- ) {
			bOp = bMap[ i ].op;
			pos = bMap[ i ].end;
			if ( bOp.type === 'replaceMetadata' ) {
				items = mkReplaceExtra(
					bMap[ i ].insert, bMap[ i ].remove, preferB
				);
				if ( !preferB ) {
					pos = pos.subtract( 0, 1 );
				}
				lookup( pos );
				if ( j >= 0 ) {
					switch ( aMap[ j ].op.type ) {
					case 'retain':
						// no change needed!
						break;
					case 'retainMetadata':
					case 'retainFinal':
					case 'retainData':
						aMap[ j ].correction.meta += items.extra.length;
						break;
					case 'replaceMetadata':
						insPos = pos.meta - aMap[ j ].start.meta;
						if ( !preferB ) { insPos++; }
						ve.batchSplice(
							aMap[ j ].remove, insPos, 0, items.extra
						);
						insPos = preferB ? 0 : aMap[ j ].insert.length;
						ve.batchSplice(
							aMap[ j ].insert, insPos, 0, items.extra
						);
						break;
					case 'replace':
						debugger;
						break;
					default:
						throw new Error( 'waaaa' );
					}
				} else {
					aMap[ j ].correction.meta += items.extra.length;
				}
				if ( preferB ) {
					pos = pos.subtract( 0, 1 );
				}
				// now handle removed/replaced items
				k = items.replace.length - 1;
				for ( ; !pos.lt( bMap[ i ].start ); pos = pos.subtract( 0, 1 ), k-- ) {
					lookup( pos ); // find location in aMap corresponding to pos
					if ( j >= 0 ) {
						switch( aMap[ j ].op.type ) {
						case 'replaceMetadata':
							aMap[ j ].remove[ pos.meta - aMap[ j ].start.meta ] =
								items.replace[ k ];
							break;
						case 'retainMetadata':
						case 'retainData':
							if ( items.replace[ k ] === DELETED ) {
								aMap[ j ].correction.meta--;
							}
							break;
						case 'replace':
						case 'retain':
							debugger;
							break;
						default:
							throw new Error( 'waaa' );
						}
					} else if ( items.replace[ k ] === DELETED ) {
						aMap[ j ].correction.meta--;
					}
				}
			} else if ( bOp.type === 'replace' ) {
				items = mkReplaceExtra(
					bMap[ i ].insert, bMap[ i ].remove, preferB
				);
				// insert extraItems:
				if ( !preferB ) {
					pos = pos.subtract( 1 );
				}
				lookup( pos ); // find location in aMap corresponding to pos
				if ( j >= 0 ) {
					switch ( aMap[ j ].op.type ) {
					case 'replaceMetadata':
					case 'retainMetadata':
					case 'retainData':
						debugger;
						break;
					case 'retain':
					case 'retainFinal':
						aMap[ j ].correction.data += items.extra.length;
						break;
					case 'replace':
						insPos = pos.data - aMap[ j ].start.data;
						if ( !preferB ) { insPos++; }
						ve.batchSplice(
							aMap[ j ].remove, insPos, 0, items.extra
						);
						insPos = preferB ? 0 : aMap[ j ].insert.length;
						ve.batchSplice(
							aMap[ j ].insert, insPos, 0, items.extra
						);
						break;
					default:
						throw new Error( 'waaa' );
					}
				} else {
					aMap[ j ].correction.data += items.extra.length;
				}
				if ( preferB ) {
					pos = pos.subtract( 1 );
				}
				// now handle removed/replaced items.
				k = items.replace.length - 1;
				for ( ; !pos.lt( bMap[ i ].start ); pos = pos.subtract( 1 ), k-- ) {
					lookup( pos ); // find location in aMap corresponding to pos
					if ( j >= 0 ) {
						switch( aMap[ j ].op.type ) {
						case 'replace':
							aMap[ j ].remove[ pos.data - aMap[ j ].start.data ] =
								items.replace[ k ];
							break;
						case 'retain':
							if ( items.replace[ k ] === DELETED ) {
								aMap[ j ].correction.data--;
							}
							break;
						case 'replaceMetadata':
						case 'retainMetadata':
						case 'retainData':
							// we're replacing or deleting an element which
							// is targeted by a metadata operation.
							// we need to shift this metadata operation.
							debugger;
							break;
						default:
							throw new Error( 'waaa' );
						}
					} else if ( items.replace[ k ] === DELETED ) {
						aMap[ j ].correction.data--;
					}
				}
			}
		}
		r = new ve.dm.Transaction();
		for ( i = 0; i < aMap.length; i++ ) {
			aOp = aMap[ i ].op;
			switch ( aOp.type ) {

			case 'retainData':
				// skip past any added metadata
				r.pushRetainMetadata( aMap[ i ].correction.meta );
				// skip past data-after-metadata
				r.pushRetain( 1 );
				break;

			case 'retain':
			case 'retainMetadata':
			case 'retainFinal':
				pos = ( aOp.type === 'retain' ) ?
					new Position( aMap[ i ].op.length ) :
					new Position( 0, aMap[ i ].op.length );
				pos = pos.add( aMap[ i ].correction );
				r.pushRetain( pos.data );
				r.pushRetainMetadata( pos.meta );
				break;

			case 'replace':
				aMap[ i ].remove = aMap[ i ].remove.filter( isNotDeleted );
				pushReplaceMerged( r, aMap[ i ].remove, aMap[ i ].insert );
				break;

			case 'replaceMetadata':
				aMap[ i ].remove = aMap[ i ].remove.filter( isNotDeleted );
				cnt = countCommonPrefixSuffix(
					aMap[ i ].remove, aMap[ i ].insert
				);
				r.pushRetainMetadata( cnt[ 0 ] ); // common prefix length
				r.pushReplaceMetadata(
					aMap[ i ].remove.slice( cnt[ 0 ], aMap[ i ].remove.length - cnt[ 1 ] ),
					aMap[ i ].insert.slice( cnt[ 0 ], aMap[ i ].insert.length - cnt[ 1 ] )
				);
				r.pushRetainMetadata( cnt[ 1 ] ); // common suffix length
				break;

			default:
				throw new Error( 'more work to do!' );
			}
		}
		return r;
	}

	/* Public methods */

	/**
	 * @class ve.dm.Transaction
	 */

	/**
	 * Transform this transaction as though the `other` transaction had come
	 * before it.
	 * Returns a pair, `[new_version_of_this, transformed_other]`, such the the
	 * document resulting from:
	 * ```
	 * doc.commit( other );
	 * doc.commit( new_version_of_this );
	 * ```
	 * is identical to the document which would result from:
	 * ```
	 * doc.commit( this );
	 * doc.commit( transformed_other );
	 * ```
	 * Does not modify this transaction.
	 *
	 * @method
	 * @param {ve.dm.Transaction} other The transaction to transpose against.
	 * @returns {ve.dm.Transaction[]} The pair of transposed transactions.
	 */
	ve.dm.Transaction.prototype.transpose = function ( other ) {
		// Special case when this is identical to other.
		if ( ve.compare( this.operations, other.operations ) ) {
			return [ new ve.dm.Transaction(), new ve.dm.Transaction() ];
		}
		// Special case when one or the other is a no-op.
		if ( this.isNoOp() || other.isNoOp() ) {
			return [ this.clone(), other.clone() ];
		}
		// Create final result by calling `transposeOne` twice.
		return [
			transposeOne( mkMap( this ), mkMap( other ), false ),
			transposeOne( mkMap( other ), mkMap( this ), true )
		];
	};


} )( ve );
