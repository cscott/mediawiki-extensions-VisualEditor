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
	 * Helper function for `transposeOne()`.
	 *
	 * We preprocess transactions' operation lists to annotate them with
	 * old position information and mutable insert/remove lists.  We
	 * call the result a 'map'.
	 */
	function mkMap( tx ) {
		var oldPos = 0;
		return tx.operations.map( function( op ) {
			var m = {
				op: op,
				start: oldPos
			};
			switch ( op.type ) {
			case 'retain':
				m.correction = 0;
				oldPos += op.length;
				break;
			case 'replace':
				m.remove = op.remove.slice( 0 );
				m.insert = op.insert.slice( 0 );
				oldPos += op.remove.length;
				break;
			default:
				throw new Error( 'unhandled type: ' + op.type );
			}
			m.end = oldPos;
			return m;
		} );
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
	 * Helper function for `transpose()`.
	 *
	 * Transposing `a` by `b` is almost the same as transposing `b` by `a`; we just
	 * break some ties in opposite ways to ensure the results are consistent.
	 * So we define `transposeOne` here, and then call it twice to create the
	 * full `transpose` result.
	 */
	function transposeOne( aMap, bMap, preferB ) {
		var r, i, j, k, aOp, bOp, insPos, delItems, lookup, pos, extraItems, cnt;
		// go through operations in b, applying them to a.
		// Do this in reverse order so that we avoid changing the offsets
		// of operations we haven't yet processed.
		j = aMap.length - 1;
		lookup = function( pos ) {
			// find the location in aMap corresponding to pos
			while ( j >= 0 && aMap[ j ].start > pos ) {
				j--;
			}
		};
		// allow corrections before start
		aMap[ -1 ] = { correction: 0 };
		// push fake 'retain 0' at end of aMap to allow corrections after end
		pos = aMap.length > 0 ? aMap[ aMap.length - 1 ].end : 0;
		aMap[ ++j ] = {
			correction: 0,
			op: { type: 'retain', length: 0 },
			start: pos,
			end: pos
		};

		for ( i = bMap.length - 1; i >= 0; i-- ) {
			bOp = bMap[ i ].op;
			if ( bOp.type !== 'replace') { continue; }
			pos = bMap[ i ].end;
			// slice handles the case where remove.length < insert.length fine.
			delItems = bMap[ i ].insert.slice( 0, bMap[ i ].remove.length );
			while ( delItems.length < bMap[ i ].remove.length ) {
				if ( preferB ) {
					delItems.push( DELETED );
				} else {
					delItems.unshift( DELETED );
				}
			}
			extraItems = bMap[ i ].insert.slice( bMap[ i ].remove.length );
			// insert extraItems:
			// preferB means insert extraItems *before* pos
			// !preferB means insert extraItems *after* pos-1
			if ( !preferB ) {
				pos--;
			}
			lookup( pos ); // find location in aMap corresponding to pos
			if ( j >= 0 && aMap[ j ].op.type === 'replace' ) {
				insPos = pos - aMap[ j ].start;
				if ( !preferB ) { insPos++; }
				ve.batchSplice(
					aMap[ j ].remove, insPos, 0, extraItems
				);
				insPos = preferB ? 0 : aMap[ j ].insert.length;
				ve.batchSplice(
					aMap[ j ].insert, insPos, 0, extraItems
				);
			} else {
				aMap[ j ].correction += extraItems.length;
			}
			if ( preferB ) {
				pos--;
			}
			// now handle removed/replaced items.
			k = delItems.length - 1;
			for ( ; pos >= bMap[ i ].start ; pos--, k-- ) {
				lookup( pos ); // find location in aMap corresponding to pos
				if ( j >= 0 && aMap[ j ].op.type === 'replace' ) {
					aMap[ j ].remove[ pos - aMap[ j ].start ] =
						delItems[ k ];
				} else if ( delItems[ k ] === DELETED ) {
					aMap[ j ].correction--;
				}
			}
		}
		r = new ve.dm.Transaction();
		r.pushRetain( aMap[ -1 ].correction );
		for ( i = 0; i < aMap.length; i++ ) {
			aOp = aMap[ i ].op;
			switch ( aOp.type ) {
			case 'retain':
				r.pushRetain( aMap[ i ].op.length + aMap[ i ].correction );
				break;
			case 'replace':
				// optimize insert/remove sets in A (avoid removing then reinserting)
				aMap[ i ].remove = aMap[ i ].remove.filter( isNotDeleted );
				cnt = countCommonPrefixSuffix( aMap[ i ].remove, aMap[ i ].insert );
				r.pushRetain( cnt[ 0 ] ); // common prefix length
				r.pushReplaceInternal(
					aMap[ i ].remove.slice( cnt[ 0 ], aMap[ i ].remove.length - cnt[ 1 ] ),
					aMap[ i ].insert.slice( cnt[ 0 ], aMap[ i ].insert.length - cnt[ 1 ] )
				);
				r.pushRetain( cnt[ 1 ] ); // common suffix length
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
