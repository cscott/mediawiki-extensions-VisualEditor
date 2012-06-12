/**
 * This module creates a parsoid interface for use in the collaboration server
**/
var mp = '../../parser/';

var ParserPipelineFactory = require(mp + 'mediawiki.parser.js').ParserPipelineFactory,
	ParserEnv = require(mp + 'mediawiki.parser.environment.js').MWParserEnvironment,
WikitextSerializer = require(mp + 'mediawiki.WikitextSerializer.js').WikitextSerializer;

parse = function( title, callback ) {
	var env = new ParserEnv( { 
		// fetch templates from enwiki for now..
		wgScript: 'http://localhost/mediawiki/',
		// stay within the 'proxied' content, so that we can click around
		wgScriptPath: '', //http://en.wikipedia.org/wiki', 
		wgScriptExtension: '.php',
		// XXX: add options for this!
		wgUploadPath: 'http://upload.wikimedia.org/wikipedia/commons',
		fetchTemplates: true,
		// enable/disable debug output using this switch	
		debug: false,
		trace: false,
		maxDepth: 40
	} );
	var parserPipelineFactory = new ParserPipelineFactory( env );
	env.pageName = title;

	var parser = parserPipelineFactory.makePipeline( 'text/x-mediawiki/full' );
	parser.on('document', function ( document ) {
		this.outHTML = document.body.innerHTML;
		callback( this.outHTML );
	});
	parser.process( '{{:' + title + '}}' );
};

if( typeof module == 'object' ) {
	module.exports.parse = parse;
}
