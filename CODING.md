# Contributing to Visual Editor

Thank you for helping us develop the Visual Editor!

This file discusses how to report bugs, set up a development environment,
run tests, and build documentation.  It also provides the code style
guidelines we use on the project.

## Bug reports

Please report bugs using the
[Wikimedia Foundation's bugzilla instance](https://bugzilla.wikimedia.org/).
Use the `VisualEditor` product, and feel free to use the `General` component
if you don't know where else your bug might belong.  Don't worry about
specifying version, severity, hardware, or OS.

## Running tests

VisualEditor uses the [Grunt](http://gruntjs.com/) task runner.
To install it (and other needed packages), run:
```sh
$ npm install
$ npm install -g grunt-cli
```

To run the tests, use:
```sh
$ grunt test
```

For other grunt tasks, see:
```sh
$ grunt --help
```

## Building documentation

VisualEditor uses [JSDuck](https://github.com/senchalabs/jsduck) to
process documentation comments embedded in the code.  To build the
documentation, you will need `ruby`, `gem`, and `jsduck` installed.

### Installing ruby and gem

You're mostly on your own here, but we can give some hints for Mac OS X.

##### Installing Gem in Mac OS X
Ruby ships with OSX but may be outdated. Use [Homebrew](http://mxcl.github.com/homebrew/):
```
$ brew install ruby
```

If you've never used `gem` before, don't forget to add the gem's bin to your `PATH` ([howto](http://stackoverflow.com/a/14138490/319266)).

### Installing jsduck

Once you have gem, installing [JSDuck](https://github.com/senchalabs/jsduck) is easy:
```
$ gem install --user-install jsduck --version '< 5'
```

You need to make sure that you are using jsduck 4.x, as jsduck 5.x introduced
incompatible changes to custom tags.

### Running jsduck

First, set `MW_INSTALL_PATH` in your environment to the location of your
mediawiki installation.  Then:

```
$ cd VisualEditor
$ .docs/generate.sh
$ open ./docs/index.html
```

For more options:
```
$ jsduck --help
```


## VisualEditor Code Guidelines

We inherit the code structure (about whitespace, naming and comments) conventions
from MediaWiki. See [Manual:Coding conventions/JavaScript#Code structure](https://www.mediawiki.org/wiki/Manual:Coding_conventions/JavaScript#Code_structure) on mediawiki.org.

### Documentation comments

* End sentences in a full stop.
* Continue sentences belonging to an annotation on the next line, indented with an
  additional space.
* Types in documentation comments should be separated by a pipe character. Use types
  that are listed in the Types section of this document, otherwise use the identifier
  (full path from the global scope) of the constructor function (e.g. `{ve.dm.BranchNode}`).

#### Annotations

We use the following annotations. They should be used in the order as they are described
here, for consistency. See [JSDuck/Tags](https://github.com/senchalabs/jsduck/wiki/Tags) for more elaborate documentation.

* @class Name (optional, guessed)
* @abstract
* @extends ClassName
* @mixins ClassName
* @constructor
* @private
* @static
* @method name (optional, guessed)
* @template
* @property name (optional, guessed)
* @until Text: Optional text.
* @source Text
* @context {Type} Optional text.
* @param {Type} name Optional text.
* @emits name
* @returns {Type} Optional text.
* @chainable
* @throws {Type}

#### Types

Special values:
* undefined
* null
* this

Primitive types:
* boolean
* number
* string

Built-in classes:
* Array
* Date
* Function
* RegExp
* Object

Browser classes:
* HTMLElement

jQuery classes:
* jQuery
* jQuery.Event
