/*!
 * VisualEditor DataModel Transaction transposition tests.
 *
 * @copyright 2011-2013 VisualEditor Team and others; see AUTHORS.txt
 * @license The MIT License (MIT); see LICENSE.txt
 */

QUnit.module( 've.dm.Transaction.transpose' );

/* Helper methods */

// Don't enable certain tests, since transpose doesn't (yet) support metadata
var disableMetadataTests = true;

/* Tests */

QUnit.test( 'transpose (simple string changes)', function ( assert ) {
	// Simple transaction transpose tests w/o use of a parent document.
	function fromChange( oldValue, newValue ) {
		var commonStart, commonEnd, removed, inserted, tx;
		if ( typeof oldValue !== 'string' || typeof newValue !== 'string' ) {
			throw new Error( 'fromChange not being called correctly' );
		}
		commonStart = 0;
		while ( commonStart < newValue.length &&
			newValue.charAt( commonStart ) === oldValue.charAt( commonStart ) ) {
			commonStart++;
		}
		commonEnd = 0;
		while ( commonEnd < ( newValue.length - commonStart ) &&
			commonEnd < ( oldValue.length - commonStart ) &&
			newValue.charAt( newValue.length - commonEnd - 1 ) ===
			oldValue.charAt( oldValue.length - commonEnd - 1 )) {
			commonEnd++;
		}
		removed = oldValue.substr( commonStart, oldValue.length - commonStart - commonEnd );
		inserted = newValue.substr( commonStart, newValue.length - commonStart - commonEnd );
		// make a transaction object (the hard way)
		tx = new ve.dm.Transaction();
		tx.pushRetain( commonStart );
		tx.pushReplaceInternal( removed.split( '' ), inserted.split( '' ) );
		tx.pushRetain( oldValue.length - removed.length - commonStart );
		assert.strictEqual(
			tx.lengthDifference,
			( newValue.length - oldValue.length ), 'tx length difference'
		);
		return tx;
	}
	function convertToMeta( tx ) {
		var r = new ve.dm.Transaction();
		r.pushRetain( 1 );
		$.each( tx.operations, function( _, op ) {
			switch ( op.type ) {
			case 'retain':
				r.pushRetainMetadata( op.length );
				break;
			case 'replace':
				r.pushReplaceMetadata( op.remove, op.insert );
				break;
			}
		});
		r.pushRetain( 1 );
		return r;
	}
	function convertFromMeta( tx ) {
		var r = new ve.dm.Transaction();
		$.each( tx.operations, function( _, op ) {
			switch ( op.type ) {
			case 'retainMetadata':
				r.pushRetain( op.length );
				break;
			case 'replaceMetadata':
				r.pushReplaceInternal( op.remove, op.insert );
				break;
			}
		});
		return r;
	}
	function apply( text, transaction ) {
		var result = '', p = 0;
		if ( transaction.isNoOp() ) {
			return text;
		}
		$.each( transaction.operations, function(_, t) {
			switch (t.type) {
			case 'retain':
				result += text.substr( p, t.length );
				p += t.length;
				break;
			case 'replace':
				result += t.insert.join( '' );
				p += t.remove.length;
				break;
			default:
				throw new Error( 'Unexpected transaction operation: ' + t.type );
			}
		} );
		return result;
	}
	function runTest1( _, test ) {
		var txa, txb, result, to1, to2, desc = test.desc;
		txa = fromChange( test.from, test.a );
		txb = fromChange( test.from, test.b );
		if ( test.useMeta ) {
			txa = convertToMeta( txa );
			txb = convertToMeta( txb );
		}
		result = txa.transpose( txb );
		if ( test.useMeta ) {
			txa = convertFromMeta( txa );
			txb = convertFromMeta( txb );
			result = [
				convertFromMeta( result[0] ), convertFromMeta( result[1] )
			];
		}
		to1 = apply( apply( test.from, txa ), result[1] );
		to2 = apply( apply( test.from, txb ), result[0] );
		assert.strictEqual( to1, test.to, desc + ': result after A, B\'' );
		assert.strictEqual( to2, test.to, desc + ': result after B, A\'' );
		assert.deepEqual( result[0].getOperations(), test.aprime,
			desc + ': operations in A\'' );
		assert.deepEqual( result[1].getOperations(), test.bprime,
			desc + ': operations in B\'' );
	}
	var cases = [
		{
			desc: 'Two insertions',
			from: 'abcdef',
			a: 'Xabcdef', // [insert "X" @0]
			b: 'aYbcdef', // [insert "Y" @1]
			aprime: [ // -> becomes [insert "X" @0]
				{ type: 'replace', insert: [ 'X' ], remove: [] },
				{ type: 'retain', length: 7 }
			],
			bprime: [ // -> becomes [insert "Y" @2]
				{ type: 'retain', length: 2 },
				{ type: 'replace', insert: [ 'Y' ], remove: [] },
				{ type: 'retain', length: 5 }
			],
			to: 'XaYbcdef',
			symmetric: true
		},
		{
			desc: 'Insert at same spot (1)',
			from: 'abc',
			a: 'abcX', // [insert "X" @3]
			b: 'abcY', // [insert "Y" @3]
			aprime: [ // -> becomes [insert "X" @4]
				{ type: 'retain', length: 4 },
				{ type: 'replace', insert: [ 'X' ], remove: [] }
			],
			bprime: [ // -> becomes [insert "Y" @3]
				{ type: 'retain', length: 3 },
				{ type: 'replace', insert: [ 'Y' ], remove: [] },
				{ type: 'retain', length: 1 }
			],
			to: 'abcYX' // precedence matters
		},
		{
			desc: 'Insert at same spot (2)',
			from: 'abcdef',
			a: 'Xabcdef', // [insert "X" @0]
			b: 'Yabcdef', // [insert "Y" @0]
			aprime: [ // -> becomes [insert "X" @1]
				{ type: 'retain', length: 1 },
				{ type: 'replace', insert: [ 'X' ], remove: [] },
				{ type: 'retain', length: 6 }
			],
			bprime: [ // -> becomes [insert "Y" @0]
				{ type: 'replace', insert: [ 'Y' ], remove: [] },
				{ type: 'retain', length: 7 }
			],
			to: 'YXabcdef' // precedence matters
		},
		{
			desc: 'Two deletions (1)',
			from: 'abcdef',
			a: 'bcdef', // [delete 1 chars @0]
			b: 'acdef', // [delete 1 chars @1]
			aprime: [ // -> becomes [delete 1 chars @0]
				{ type: 'replace', insert: [], remove: [ 'a' ] },
				{ type: 'retain', length: 4 }
			],
			bprime: [ // -> becomes [delete 1 chars @0]
				{ type: 'replace', insert: [], remove: [ 'b' ] },
				{ type: 'retain', length: 4 }
			],
			to: 'cdef',
			symmetric: true
		},
		{
			desc: 'Two deletions (2)',
			from: 'abcdef',
			a: 'cdef', // [delete 2 chars @0]
			b: 'acdef', // [delete 1 chars @1]
			aprime: [ // -> becomes [delete 1 chars @0]
				{ type: 'replace', insert: [], remove: [ 'a' ] },
				{ type: 'retain', length: 4 }
			],
			bprime: [ // -> becomes [no-op]
				{ type: 'retain', length: 4 }
			],
			to: 'cdef',
			symmetric: true
		},
		{
			desc: 'Two deletions (3)',
			from: 'abcdef',
			a: 'bcdef', // [delete 1 chars @0]
			b: 'acdef', // [delete 1 chars @1]
			aprime: [ // -> becomes [delete 1 chars @0]
				{ type: 'replace', insert: [], remove: [ 'a' ] },
				{ type: 'retain', length: 4 }
			],
			bprime: [ // -> becomes [delete 1 chars @0]
				{ type: 'replace', insert: [], remove: [ 'b' ] },
				{ type: 'retain', length: 4 }
			],
			to: 'cdef',
			symmetric: true
		},
		{
			desc: 'Two deletions (4)',
			from: 'abcdef',
			a: 'ef', // [delete 4 chars @0]
			b: 'acdef', // [delete 1 chars @1]
			aprime: [ // -> becomes [delete 3 chars @0]
				{ type: 'replace', insert: [], remove: [ 'a', 'c', 'd' ] },
				{ type: 'retain', length: 2 }
			],
			bprime: [ // -> becomes [no-op]
				{ type: 'retain', length: 2 }
			],
			to: 'ef',
			symmetric: true
		},
		{
			desc: 'Two deletions (5)',
			from: 'abcdef',
			a: 'def', // [delete 3 chars @0]
			b: 'ab', // [delete 4 chars @2]
			aprime: [ // -> becomes [delete 2 chars @0]
				{ type: 'replace', insert: [], remove: [ 'a', 'b' ] }
			],
			bprime: [ // -> becomes [delete 3 chars @0]
				{ type: 'replace', insert: [], remove: [ 'd', 'e', 'f' ] }
			],
			to: '',
			symmetric: true
		},
		{
			desc: 'Insertion and replacement (1)',
			from: 'abcdef',
			a: 'Xabcdef', // [insert "X" @0]
			b: 'abYef', // [replace 2 chars with "Y" @2]
			aprime: [ // -> becomes [insert "X" @0]
				{ type: 'replace', insert: [ 'X' ], remove: [] },
				{ type: 'retain', length: 5 }
			],
			bprime: [ // -> becomes [replace 2 chars with "Y" @3]
				{ type: 'retain', length: 3 },
				{ type: 'replace', insert: [ 'Y' ], remove: [ 'c', 'd' ] },
				{ type: 'retain', length: 2 }
			],
			to: 'XabYef',
			symmetric: true
		},
		{
			desc: 'Insertion and replacement (2)',
			from: 'abcdef',
			a: 'abYef', // [replace 2 chars with "Y" @2]
			b: 'abXcdef', // [insert "X" @2]
			aprime: [ // -> becomes [replace 2 chars with "Y" @3]
				{ type: 'retain', length: 3 },
				{ type: 'replace', insert: [ 'Y' ], remove: [ 'c', 'd' ] },
				{ type: 'retain', length: 2 }
			],
			bprime: [ // -> becomes [insert "X" @2]
				{ type: 'retain', length: 2 },
				{ type: 'replace', insert: [ 'X' ], remove: [] },
				{ type: 'retain', length: 3 }
			],
			to: 'abXYef',
			symmetric: true
		},
		{
			desc: 'Insertion and replacement (3)',
			from: 'abcdef',
			a: 'aXbcdef', // [insert "X" @1]
			b: 'Ydef', // [replace 3 chars with "Y" @0]
			aprime: [ // -> becomes [insert "X" @0]
				{ type: 'replace', insert: [ 'X' ], remove: [] },
				{ type: 'retain', length: 4 }
			],
			bprime: [ // -> becomes [replace 4 chars with "XY" @0]
				{ type: 'replace', insert: [ 'X', 'Y' ], remove: [ 'a', 'X', 'b', 'c' ] },
				{ type: 'retain', length: 3 }
			],
			to: 'XYdef'
		},
		{
			desc: 'Insertion and replacement (3) [flipped]',
			from: 'abcdef',
			a: 'Ydef', // [replace 3 chars with "Y" @0]
			b: 'aXbcdef', // [insert "X" @1]
			aprime: [ // -> becomes [replace 4 chars with "YX" @0]
				{ type: 'replace', insert: [ 'Y', 'X' ], remove: [ 'a', 'X', 'b', 'c' ] },
				{ type: 'retain', length: 3 }
			],
			bprime: [ // -> becomes [insert "X" @1]
				{ type: 'retain', length: 1 },
				{ type: 'replace', insert: [ 'X' ], remove: [] },
				{ type: 'retain', length: 3 }
			],
			to: 'YXdef'
		},
		{
			desc: 'Insertion and replacement (4)',
			from: 'abcdef',
			a: 'Ydef', // [replace 3 chars with "Y" @0]
			b: 'aXbcdef', // [insert "X" @1]
			aprime: [ // -> becomes [replace 4 chars with "YX" @0]
				{ type: 'replace', insert: [ 'Y','X' ], remove: [ 'a', 'X', 'b', 'c' ] },
				{ type: 'retain', length: 3 }
			],
			bprime: [ // -> becomes [insert "X" @1]
				{ type: 'retain', length: 1 },
				{ type: 'replace', insert: [ 'X' ], remove: [] },
				{ type: 'retain', length: 3 }
			],
			to: 'YXdef'
		},
		{
			desc: 'Insertion and replacement (4) [flipped]',
			from: 'abcdef',
			a: 'aXbcdef', // [insert "X" @1]
			b: 'Ydef', // [replace 3 chars with "Y" @0]
			aprime: [ // -> becomes [insert "X" @0]
				{ type: 'replace', insert: [ 'X' ], remove: [] },
				{ type: 'retain', length: 4 }
			],
			bprime: [ // -> becomes [replace 4 chars with "XY" @0]
				{ type: 'replace', insert: [ 'X','Y' ], remove: [ 'a', 'X', 'b', 'c' ] },
				{ type: 'retain', length: 3 }
			],
			to: 'XYdef'
		},
		{
			desc: 'Insertion and replacement (5)',
			from: 'abcdef',
			a: 'abcdXef', // [insert "X" @ 4]
			b: 'abYef', // [replace 2 chars with "Y" @2]
			aprime: [ // -> becomes [insert "X" @3]
				{ type: 'retain', length: 3 },
				{ type: 'replace', insert: [ 'X' ], remove: [] },
				{ type: 'retain', length: 2 }
			],
			bprime: [ // -> becomes [replace 2 chars with "Y" @2]
				{ type: 'retain', length: 2 },
				{ type: 'replace', insert: [ 'Y' ], remove: [ 'c', 'd' ] },
				{ type: 'retain', length: 3 }
			],
			to: 'abYXef'
		},
		{
			desc: 'Insertion and replacement (5) [flipped]',
			from: 'abcdef',
			a: 'abYef', // [replace 2 chars with "Y" @2]
			b: 'abcdXef', // [insert "X" @ 4]
			aprime: [ // -> becomes [replace 3 chars with "XY" @2]
				{ type: 'retain', length: 2 },
				{ type: 'replace', insert: [ 'Y' ], remove: [ 'c', 'd' ] },
				{ type: 'retain', length: 3 }
			],
			bprime: [ // -> becomes [insert "X" @2]
				{ type: 'retain', length: 3 },
				{ type: 'replace', insert: [ 'X' ], remove: [] },
				{ type: 'retain', length: 2 }
			],
			to: 'abYXef'
		},
		{
			desc: 'Insertion and replacement (6)',
			from: 'abcdef',
			a: 'Xabcdef', // [insert "X" @0]
			b: 'abYef', // [replace 2 chars with "Y" @2]
			aprime: [ // -> becomes [insert "X" @0]
				{ type: 'replace', insert: [ 'X' ], remove: [] },
				{ type: 'retain', length: 5 }
			],
			bprime: [ // -> becomes [replace 2 chars with "Y" @3]
				{ type: 'retain', length: 3 },
				{ type: 'replace', insert: [ 'Y' ], remove: [ 'c', 'd' ] },
				{ type: 'retain', length: 2 }
			],
			to: 'XabYef',
			symmetric: true
		},
		{
			desc: 'Simultaneous identical changes',
			from: 'abcdef',
			a: 'aXcYef', // [replace 3 char with "XcY" @1]
			b: 'aXcYef', // [replace 3 char with "XcY" @1]
			aprime: [ // -> becomes no-op
			],
			bprime: [ // -> becomes no-op
			],
			to: 'aXcYef'
		},
		{
			desc: 'Remove while insert',
			from: 'abcd',
			a: 'abXcd',
			b: 'ad',
			aprime: [
				{ type: 'retain', length: 1 },
				{ type: 'replace', insert: [ 'X' ], remove: [] },
				{ type: 'retain', length: 1 }
			],
			bprime: [
				{ type: 'retain', length: 1 },
				{ type: 'replace', insert: [ 'X' ], remove: [ 'b', 'X', 'c' ] },
				{ type: 'retain', length: 1 }
			],
			to: 'aXd',
			symmetric: true
		}
	];
	$.each( cases, function( _, test ) {
		if ( test.symmetric ) {
			cases.push( {
				desc: test.desc + ' [flipped]',
				from: test.from,
				a: test.b,
				b: test.a,
				aprime: test.bprime,
				bprime: test.aprime,
				to: test.to
			} );
		}
	});
	if ( !disableMetadataTests ) {
		$.each( cases, function( _, test ) {
			var newTest = ve.copy ( test );
			newTest.desc += ' [meta]';
			newTest.useMeta = true;
			cases.push( newTest );
		} );
	}
	QUnit.expect( cases.length * 6 );
	$.each( cases, runTest1 );
});

QUnit.test( 'transpose (with ve.dm.Document)', function ( assert ) {
	// Transaction transpose tests with a full ve.dm.Document.
	var cases,
		metadataElement = {
			'type': 'alienMeta',
			'attributes': {
				'style': 'comment',
				'text': ' inline '
			}
		};
	function runTest2( _, test ) {
		var doc1, doc2, txa, txb, result, expected;
		doc1 = ve.dm.example.createExampleDocument( test.doc );
		doc2 = ve.dm.example.createExampleDocument( test.doc );
		txa = ve.dm.Transaction[ test.a[0] ].apply(null, [ doc1 ].concat( test.a.slice(1) ) );
		txb = ve.dm.Transaction[ test.b[0] ].apply(null, [ doc2 ].concat( test.b.slice(1) ) );
		if ( test.disabled ) {
			// make the number of assertions work out correctly before we bail.
			assert.ok(true); assert.ok(true); assert.ok(true); assert.ok(true);
			return;
		}
		result = txa.transpose( txb );
		assert.deepEqualWithDomElements( result[0].getOperations(), test.aprime,
			test.desc + ': operations in A\'' );
		assert.deepEqualWithDomElements( result[1].getOperations(), test.bprime,
			test.desc + ': operations in B\'' );
		// apply a, then b' to doc1
		doc1.commit( txa ); doc1.commit( result[1] );
		// apply b, then a' to doc2
		doc2.commit( txb ); doc2.commit( result[0] );
		// both documents should be identical.
		assert.equalNodeTree( doc1.getDocumentNode(), doc2.getDocumentNode(),
			test.desc + ': results after A,B\' and B,A\' match' );
		// verify resulting document.
		expected = ve.dm.example.createExampleDocument( test.doc ).getFullData();
		test.expected( expected ); // adjust expectations
		assert.deepEqualWithDomElements( doc1.getFullData(), expected, test.desc + ': result as expected' );
	}
	cases = [
		{
			desc: 'Simple insertion',
			doc: 'data',
			a: [ 'newFromInsertion', 0, [
				{ 'type': 'paragraph' }, 'X', { 'type': '/paragraph' }
			] ],
			b: [ 'newFromInsertion', 0, [
				{ 'type': 'paragraph' }, 'Y', { 'type': '/paragraph' }
			] ],
			aprime: [
				{ type: 'retain', length: 3 },
				{ type: 'replace', remove: [], insert: [
					{ 'type': 'paragraph' }, 'X', { 'type': '/paragraph' }
				] },
				{ type: 'retain', length: 63 }
			],
			bprime: [
				{ type: 'replace', remove: [], insert: [
					{ 'type': 'paragraph' }, 'Y', { 'type': '/paragraph' }
				] },
				{ type: 'retain', length: 66 }
			],
			expected: function( data ) {
				ve.batchSplice(data, 0, 0, [
					{ 'type': 'paragraph' }, 'Y', { 'type': '/paragraph' },
					{ 'type': 'paragraph' }, 'X', { 'type': '/paragraph' }
				]);
			}
		},
		{
			desc: 'Insert and wrap',
			doc: 'data',
			a: [ 'newFromWrap', new ve.Range( 1, 4 ),
				 [ { 'type': 'heading', 'attributes': { 'level': 1 } } ],
				 [ { 'type': 'paragraph' } ], [], []
			],
			b: [ 'newFromInsertion', 0, [
				{ 'type': 'paragraph' }, 'X', { 'type': '/paragraph' }
			] ],
			aprime: [
				{ type: 'retain', length: 3 },
				{ type: 'replace', remove: [
					{ 'type': 'heading', 'attributes': { 'level': 1 } }
				], insert: [
					{ 'type': 'paragraph' }
				] },
				{ type: 'retain', length: 3 },
				{ type: 'replace', remove: [
					{ 'type': '/heading' }
				], insert: [
					{ 'type': '/paragraph' }
				] },
				{ type: 'retain', length: 58 }
			],
			bprime: [
				{ type: 'replace', remove: [], insert: [
					{ 'type': 'paragraph' }, 'X', { 'type': '/paragraph' }
				] },
				{ type: 'retain', length: 63 }
			],
			expected: function( data ) {
				ve.batchSplice( data, 0, 1, [
					{ 'type': 'paragraph' }, 'X', { 'type': '/paragraph' },
					{ 'type': 'paragraph' }
				]);
				ve.batchSplice( data, 7, 1, [
					{ 'type': '/paragraph' }
				]);
			},
			symmetric: true
		},
		{
			desc: 'Insertion with metadata present',
			disabled: disableMetadataTests,
			doc: 'withMeta',
			a: [ 'newFromRemoval', new ve.Range( 1, 4 ) ],
			b: [ 'newFromRemoval', new ve.Range( 7, 10 ) ],
			aprime: [
				{ type: 'retain', length: 1 },
				{ type: 'replace', remove: [ 'F', 'o', 'o' ], insert: [] },
				{ type: 'retain', length: 6 }
			],
			bprime: [
				{ type: 'retain', length: 4 },
				{
					type: 'replace',
					insert: [],
					insertMetadata: [],
					remove: [ 'B', 'a', 'z' ],
					removeMetadata: [
						[ {
							type: 'alienMeta',
							attributes: {
								'domElements': $( '<meta property="foo" content="bar" />' ).toArray()
							}
						} ],
						undefined,
						[ {
							type: 'alienMeta',
							attributes: {
								'domElements': $( '<!-- inline -->' ).toArray()
							}
						} ]
					]
				},
				{
					type: 'replaceMetadata',
					remove: [],
					insert: [
						{
							type: 'alienMeta',
							attributes: {
								'domElements': $( '<meta property="foo" content="bar" />' ).toArray()
							}
						},
						{
							type: 'alienMeta',
							attributes: {
								'domElements': $( '<!-- inline -->' ).toArray()
							}
						}
					]
				},
				{ type: 'retain', length: 3 }
			],
			expected: function( data ) {
				ve.batchSplice( data, 19, 1, [] );
				ve.batchSplice( data, 15, 2, [] );
				ve.batchSplice( data, 5, 3, [] );
			},
			symmetric: true
		},
		{
			desc: 'Metadata insertion/removal',
			disabled: disableMetadataTests,
			doc: 'withMeta',
			a: [ 'newFromMetadataInsertion', 11, 2, [ metadataElement ] ],
			b: [ 'newFromMetadataRemoval', 11, new ve.Range( 1, 3 ) ],
			aprime: [
				{ 'type': 'retain', 'length': 11 },
				{ 'type': 'retainMetadata', 'length': 1 },
				{
					'type': 'replaceMetadata',
					'remove': [],
					'insert': [ metadataElement ]
				},
				{ 'type': 'retainMetadata', 'length': 1 },
				{ 'type': 'retain', 'length': 2 }
			],
			bprime: [
				{ 'type': 'retain', 'length': 11 },
				{ 'type': 'retainMetadata', 'length': 1 },
				{
					'type': 'replaceMetadata',
					'remove': [
						ve.dm.example.createExampleDocument( 'withMeta' ).metadata.getData( 11 )[ 1 ],
						metadataElement,
						ve.dm.example.createExampleDocument( 'withMeta' ).metadata.getData( 11 )[ 2 ]
					],
					'insert': [ metadataElement ]
				},
				{ 'type': 'retainMetadata', 'length': 1 },
				{ 'type': 'retain', 'length': 2 }
			],
			expected: function( data ) {
				ve.batchSplice( data, 23, 4, [
					metadataElement,
					{ 'type': '/alienMeta' }
				] );
			},
			symmetric: true
		},
		{
			desc: 'Replace over metadata insertion',
			disabled: disableMetadataTests || true, // we don't support this yet
			doc: 'data',
			a: [ 'newFromMetadataInsertion', 2, 0, [ metadataElement ] ],
			b: [ 'newFromRemoval', new ve.Range( 1, 4 ) ],
			aprime: [
				{ 'type': 'retain', 'length': 1 },
				{
					'type': 'replaceMetadata',
					'remove': [],
					'insert': [ metadataElement ]
				},
				{ 'type': 'retain', 'length': 59 }
			],
			bprime: [
				{ 'type': 'retain', 'length': 1 },
				{
					'type': 'replace',
					'remove': [
						'a',
						['b', [ ve.dm.example.bold ]],
						['c', [ ve.dm.example.italic ]]
					],
					'removeMetadata': [
						undefined,
						[ metadataElement ],
						undefined
					],
					'insert': [],
					'insertMetadata': []
				},
				{
					'type': 'replaceMetadata',
					'remove': [],
					'insert': [ metadataElement ]
				},
				{ 'type': 'retain', 'length': 59 }
			],
			expected: function( data ) {
				ve.batchSplice( data, 1, 3, [
					metadataElement,
					{ 'type': '/alienData' }
				] );
			},
			symmetric: true
		}
	];
	$.each( cases, function( _, test ) {
		if ( test.symmetric && !test.disabled ) {
			cases.push( {
				desc: test.desc + ' [flipped]',
				doc: test.doc,
				a: test.b,
				b: test.a,
				aprime: test.bprime,
				bprime: test.aprime,
				expected: test.expected
			} );
		}
	});
	QUnit.expect( cases.length * 4);
	$.each( cases, runTest2 );
});

QUnit.test( 'transpose (n-way)', function ( assert ) {
	// Do N^2 transposition of N different transactions, taken two
	// at a time.  Verify that the results are consistent.
	var cases, n = 0;
	function runTest3( desc, doc, a, b ) {
		var doc1, doc2, txa, txb, result;
		doc1 = ve.dm.example.createExampleDocument( doc );
		doc2 = ve.dm.example.createExampleDocument( doc );
		txa = ve.dm.Transaction[ a[0] ].apply(null, [ doc1 ].concat( a.slice(1) ) );
		txb = ve.dm.Transaction[ b[0] ].apply(null, [ doc2 ].concat( b.slice(1) ) );
		result = txa.transpose( txb );
		// apply a, then b' to doc1
		doc1.commit( txa ); doc1.commit( result[1] );
		// apply b, then a' to doc2
		doc2.commit( txb ); doc2.commit( result[0] );
		// both documents should be identical.
		assert.equalNodeTree(
			doc1.getDocumentNode(), doc2.getDocumentNode(),
			desc + ': results after A,B\' and B,A\' match'
		);
	}

	cases = [
		{
			doc: 'data',
			transactions: {
				// insertions at same point
				'insert X@0': [
					'newFromInsertion', 0,
					[ { 'type': 'paragraph' }, 'X', { 'type': '/paragraph' } ]
				],
				'insert Y@0': [
					'newFromInsertion', 0,
					[ { 'type': 'paragraph' }, 'Y', { 'type': '/paragraph' } ]
				],
				// overlapping removals
				'remove ab': [
					'newFromRemoval', new ve.Range( 1, 3 )
				],
				'remove bc': [
					'newFromRemoval', new ve.Range( 2, 4 )
				],
				// wrap
				'convert heading': [
					'newFromWrap', new ve.Range( 1, 4 ),
					[ { 'type': 'heading', 'attributes': { 'level': 1 } } ],
					[ { 'type': 'paragraph' } ], [], []
				],
				// overlapping attribute change
				'change heading attrib': [
					'DISABLED', // attrib not yet supported by transpose
					'newFromAttributeChanges', 0, { 'level': 2 }
				],
				// overlapping annotation change
				'bold a': [
					'DISABLED', // annotation not yet supported by transpose
					'newFromAnnotation', new ve.Range( 1, 2 ), 'set',
					ve.dm.example.createAnnotation( ve.dm.example.bold )
				]
			}
		}
	];
	$.each( cases, function( _, c ) {
		var len = Object.keys( c.transactions ).length;
		n += len * len;
	} );
	QUnit.expect( n );
	$.each( cases, function( _, c ) {
		$.each( c.transactions, function( aDesc, a ) {
			$.each( c.transactions, function( bDesc, b ) {
				if ( a[0] === 'DISABLED' || b[0] === 'DISABLED' ) {
					assert.ok( true ); // skip this transaction
				} else {
					runTest3( aDesc + ' <-> ' + bDesc, c.doc, a, b );
				}
			} );
		} );
	} );
});
