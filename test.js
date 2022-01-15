'use strict'

const assert = require('assert');
const {parse} = require('./wikiparser');

const options = {
	throwError: true,
};

function parseOrThrow(text) {
	return parse(text, options);
}

describe('WikiParser', () => {
	it('should parse plaintext', () => {
		assert.deepEqual(
			parseOrThrow(`It's some plaintext test`),
			[`It's some plaintext test`]
		);
	});

	it('should parse italics', () => {
		assert.deepEqual(
			parseOrThrow(`Some ''italic text'' ''test`),
			['Some ', {type: 'italics', content: ['italic text']}, ` ''test`]
		);
	});

	it('should parse italics with an apostrophe', () => {
		assert.deepEqual(
			parseOrThrow(`Some ''italic text''' test`),
			['Some ', {type: 'italics', content: [`italic text'`]}, ' test']
		);
	});

	it('should parse italics with an apostrophe, with multiple lines', () => {
		assert.deepEqual(
			parseOrThrow(`Some ''italic text''' test
next ''line''`),
			['Some ', {type: 'italics', content: [`italic text'`]}, ` test
next `, {type: 'italics', content: ['line']}]
		);
	});

	it('should parse bold', () => {
		assert.deepEqual(
			parseOrThrow(`Some '''bold text''' test`),
			['Some ', {type: 'bold', content: ['bold text']}, ' test']
		);
	});

	it('should parse bold italics', () => {
		assert.deepEqual(
			parseOrThrow(`Some '''''bold italic text''''' test`),
			['Some ', {type: 'boldItalics', content: ['bold italic text']}, ' test']
		);
	});

	it('should parse bold inside italics', () => {
		assert.deepEqual(
			parseOrThrow(`Some ''italic '''bold''' text'' test`),
			['Some ', {type: 'italics', content: ['italic ', {type: 'bold', content: ['bold']}, ' text']}, ' test']
		);
	});

	it('should parse <nowiki>', () => {
		assert.deepEqual(
			parseOrThrow(`Some <nowiki>''italic '''bold''' text''</nowiki> test <nowiki/>''italics''`),
			[
				'Some ',
				{type: 'nowiki', content: [`''italic '''bold''' text''`], attributes: {}},
				' test ',
				{type: 'italics', content: ['italics']},
			]
		);
	});

	it('should parse simple links', () => {
		assert.deepEqual(
			parseOrThrow(`Some [[Some page]] test`),
			['Some ', {type: 'link', to: 'Some page', content: ['Some page']}, ' test']
		);
	});

	it('should parse category links', () => {
		assert.deepEqual(
			parseOrThrow(`[[Category:Categorize]][[:Category:Link]][[:Категория:Без префикса|]]`),
			[
				{type: 'link', to: 'Category:Categorize', content: ['Category:Categorize']},
				{type: 'link', to: 'Category:Link', content: ['Category:Link'], plain: true},
				{type: 'link', to: 'Категория:Без префикса', content: ['Без префикса'], plain: true},
			]
		);
	});

	it('should parse simple links with anchors', () => {
		assert.deepEqual(
			parseOrThrow(`Some [[Some page#Some anchor]], test`),
			['Some ', {type: 'link', to: 'Some page', anchor: 'Some anchor', content: ['Some page']}, ', test']
		);
	});

	it('should parse links with trail', () => {
		assert.deepEqual(
			parseOrThrow(`Some [[Some page]]s test`),
			['Some ', {type: 'link', to: 'Some page', content: ['Some pages']}, ' test']
		);
	});

	it('should parse links with custom text', () => {
		assert.deepEqual(
			parseOrThrow(`Some [[Some ''page'' |link ''text'']] test`),
			['Some ', {type: 'link', to: `Some ''page''`, content: ['link ', {type: 'italics', content: ['text']}]}, ' test']
		);
	});

	it('should parse file links', () => {
		assert.deepEqual(
			parseOrThrow(`Some [[File:File name.jpg|thumb|link=wat|link ''text'']] test`),
			[
				'Some ',
				{
					type: 'link',
					to: `File:File name.jpg`,
					content: ['link ', {type: 'italics', content: ['text']}],
					positionalParameters: [['thumb']],
					parameters: {
						link: ['wat'],
					},
				},
				' test',
			]
		);
	});

	it('should parse external links', () => {
		assert.deepEqual(
			parseOrThrow(`Some [https://example.com/?a=b%20c#test\t link ''text''] [ftp://example.org ] [test]`),
			[
				'Some ',
				{
					type: 'externalLink',
					uri: 'https://example.com/?a=b%20c#test',
					content: ['link ', {type: 'italics', content: ['text']}],
				},
				' ',
				{
					type: 'externalLink',
					uri: 'ftp://example.org',
					content: [],
				},
				' [test]',
			]
		);

		assert.deepEqual(
			parseOrThrow(`[https://example<!--\n  -->.com Example]`),
			[
				{
					type: 'externalLink',
					uri: 'https://example.com',
					content: ['Example'],
				},
			]
		);
	});

	it('should parse headings', () => {
		assert.deepEqual(
			parseOrThrow(`=Some heading=\n===  \tAnother heading  ===\n=Not a heading`),
			[
				{type: 'heading', level: 1, content: ['Some heading']},
				{type: 'heading', level: 3, content: ['Another heading']},
				'=Not a heading',
			]
		);
	});

	it('should parse templates with positional parameters', () => {
		assert.deepEqual(
			parseOrThrow(`{{template|{{another template
 <!-- comment -->|some
 |parameters}}}}`),
			[
				{type: 'template', name: 'template', parameters: {}, positionalParameters: [
					[{type: 'template', name: 'another template', positionalParameters: [['some'], ['parameters']], parameters: {}}],
				]},
			]
		);
	});

	it('should parse templates with explicit positional parameters', () => {
		assert.deepEqual(
			parseOrThrow(`{{template|2=second|a=123|1=first}}`),
			[
				{type: 'template', name: 'template', parameters: {a: ['123']}, positionalParameters: [['first'], ['second']]},
			]
		);
	});

	it('should work with multi-character characters correctly', () => {
		assert.deepEqual(
			parseOrThrow(`İ{{template|2=second|a=123|1=first}}`),
			[
				'İ', {type: 'template', name: 'template', parameters: {a: ['123']}, positionalParameters: [['first'], ['second']]},
			]
		);

		assert.deepEqual(
			parseOrThrow(`ῶ{{template|2=second|a=123|1=first}}`),
			[
				'ῶ', {type: 'template', name: 'template', parameters: {a: ['123']}, positionalParameters: [['first'], ['second']]},
			]
		);
	});

	it('should parse templates with named parameters', () => {
		assert.deepEqual(
			parseOrThrow(`{{template
|  some  =  ''named''
 |key=value|parameters|=}}`),
			[
				{type: 'template', name: 'template', positionalParameters: [['parameters'], ['=']], parameters: {
					some: [{type: 'italics', content: ['named']}],
					key: ['value'],
				}},
			]
		);
	});

	it('should parse unordered lists', () => {
		assert.deepEqual(
			parseOrThrow(`*''a'' b
**c *d`),
			[
				{
					type: 'unorderedList',
					items: [
						{level: 1, content: [{type: 'italics', content: ['a']}, ' b']},
						{level: 2, content: ['c *d']},
					],
				},
			]
		);
	});

	it('should parse ordered lists', () => {
		assert.deepEqual(
			parseOrThrow(`#''a'' b
##c #d`),
			[
				{
					type: 'orderedList',
					items: [
						{level: 1, content: [{type: 'italics', content: ['a']}, ' b']},
						{level: 2, content: ['c #d']},
					],
				},
			]
		);
	});

	it('should parse indent', () => {
		assert.deepEqual(
			parseOrThrow(`:''a'' b
::c :d`),
			[
				{
					type: 'indent',
					items: [
						{level: 1, content: [{type: 'italics', content: ['a']}, ' b']},
						{level: 2, content: ['c :d']},
					],
				},
			]
		);
	});

	it('should parse description', () => {
		assert.deepEqual(
			parseOrThrow(`; a`),
			[{type: 'description', title: ['a'], content: []}],
		);
	});

	it('should parse description with content', () => {
		assert.deepEqual(
			parseOrThrow(`;a: b`),
			[{type: 'description', title: ['a'], content: ['b']}],
		);
	});

	it('should parse refs', () => {
		assert.deepEqual(
			parseOrThrow(`Some <ref>
 Ref text</ref> test`),
			['Some ', {type: 'ref', content: ['Ref text'], attributes: {}}, ' test']
		);
	});

	it('should parse refs with attributes', () => {
		assert.deepEqual(
			parseOrThrow(`Some <ref name="ref name">Ref text</ref> test`),
			['Some ', {type: 'ref', content: ['Ref text'], attributes: {name: 'ref name'}}, ' test']
		);
	});

	it('should parse <br/>', () => {
		assert.deepEqual(
			parseOrThrow(`Some<br >multiline<br/>text<br />test<bro/>bro`),
			[
				'Some',
				{type: 'lineBreak'},
				'multiline',
				{type: 'lineBreak'},
				'text',
				{type: 'lineBreak'},
				'test',
				{type: 'tag', name: 'bro', attributes: {}, selfClosing: true},
				'bro',
			]
		);
	});

	it('should parse <p>', () => {
		assert.deepEqual(
			parseOrThrow(`Some <p >paragraph<poem></poem><> text</p > test`),
			[
				'Some ',
				{
					type: 'tag',
					name: 'p',
					content: [
						'paragraph',
						{type: 'tag', name: 'poem', attributes: {}, content: []},
						'<> text',
					],
					attributes: {},
				},
				' test']
		);
	});

	it('should parse unclosed tags', () => {
		assert.deepEqual(
			parseOrThrow(`<ul><li>a<li><li>b</li>`),
			[
				{type: 'tag', name: 'ul', attributes: {}, content: [
					{type: 'tag', name: 'li', attributes: {}, content: [
						'a',
						{type: 'tag', name: 'li', attributes: {}, content: [
							{type: 'tag', name: 'li', attributes: {}, content: ['b']},
						]},
					]},
				]},
			]
		);
	});

	it('should parse comments', () => {
		assert.deepEqual(
			parseOrThrow(`Some <!---- commented\n text ----> test`),
			['Some ', {type: 'comment', content: ['commented\n text']}, ' test']
		);
	});

	it('should replace &nbsp; with a Unicode non-breaking space', () => {
		assert.deepEqual(
			parseOrThrow(`Some&nbsp;test`),
			['Some test']
		);
	});

	it('should parse numeric HTML entities', () => {
		assert.deepEqual(
			parseOrThrow(`&#1059; &#x5000;`),
			['У 倀']
		);
	});

	it('should parse horizontal rule', () => {
		assert.deepEqual(
			parseOrThrow(`a\n----\nb`),
			['a\n', {type: 'horizontalRule', content: []}, '\nb']
		);

		assert.deepEqual(
			parseOrThrow(`a<------------b`),
			[`a<------------b`]
		);
	});

	it('should parse <hr>', () => {
		assert.deepEqual(
			parseOrThrow(`a<hr some="attribute"> b`),
			['a', {type: 'tag', name: 'hr', attributes: {some: 'attribute'}}, ' b']
		);
	});

	it('should parse preformatted text', () => {
		assert.deepEqual(
			parseOrThrow(` a
 b
c
 some preformatted<br>
 text{{a}}
f`),
			[
				{type: 'preformatted', content: ['a\nb\n']},
				'c\n',
				{type: 'preformatted', content: [
					`some preformatted`,
					{type: 'lineBreak'},
					'\ntext',
					{type: 'template', name: 'a', parameters: {}, positionalParameters: []},
					'\n',
				]},
				'f',
			]
		);
	});

	it('should parse <source>', () => {
		assert.deepEqual(
			parseOrThrow(`Some <source lang="some language">
''preformatted''
 text
</source> test`),
			[
				'Some ',
				{type: 'source', attributes: {lang: 'some language'}, content: [`''preformatted''\n text`]},
				' test',
			]
		);
	});

	it('should parse empty tables', () => {
		assert.deepEqual(
			parseOrThrow(`{|
|}`),
			[{type: 'table', attributes: {}, caption: [], content: [
				{type: 'table-row', attributes: {}, content: []},
			]}]
		);
	});

	it('should parse simple tables', () => {
		assert.deepEqual(
			parseOrThrow(`{| class="wikitable"
|-
 ! a
  ! b
 |- style=""
	| 1
 | 2
 |}`),
			[
				{type: 'table', attributes: {class: 'wikitable'}, caption: [], content: [
					{type: 'table-row', attributes: {}, content: [
						{type: 'table-cell', header: true, attributes: {}, content: ['a']},
						{type: 'table-cell', header: true, attributes: {}, content: ['b']},
					]},
					{type: 'table-row', attributes: {style: ''}, content: [
						{type: 'table-cell', header: false, attributes: {}, content: ['1']},
						{type: 'table-cell', header: false, attributes: {}, content: ['2']},
					]},
				]},
			]
		);
	});

	it('should parse tables with comments', () => {
		assert.deepEqual(
			parseOrThrow(`{|
|-
<!-- Comment -->
|a
|}`),
			[{type: 'table', attributes: {}, caption: [], content: [
				{type: 'table-row', attributes: {}, content: [
					{type: 'table-cell', header: false, attributes: {}, content: [
						'a',
					]},
				], comments: [{type: 'comment', content: ['Comment']}]},
			]}]
		);
	});

	it('should parse tables with lists', () => {
		assert.deepEqual(
			parseOrThrow(`{|
|
*1
|}`),
			[{type: 'table', attributes: {}, caption: [], content: [
				{type: 'table-row', attributes: {}, content: [
					{type: 'table-cell', header: false, attributes: {}, content: [
						{type: 'unorderedList', items: [{level: 1, content: ['1']}]},
					]},
				]},
			]}]
		);
	});

	it('should parse tables with cell attributes', () => {
		assert.deepEqual(
			parseOrThrow(`{|
| width=200px valign=top |
*a
*b
 | style="width: 10px;" |&nbsp;
  |width=160px|
#c
#d
|}`),
			[
				{type: 'table', attributes: {}, caption: [], content: [
					{type: 'table-row', attributes: {}, content: [
						{type: 'table-cell', header: false, attributes: {width: '200px', valign: 'top'}, content: [{
							type: 'unorderedList',
							items: [
								{level: 1, content: ['a']},
								{level: 1, content: ['b']},
							],
						}]},
						{type: 'table-cell', header: false, attributes: {style: 'width: 10px;'}, content: []},
						{type: 'table-cell', header: false, attributes: {width: '160px'}, content: [{
							type: 'orderedList',
							items: [
								{level: 1, content: ['c']},
								{level: 1, content: ['d']},
							],
						}]},
					]},
				]},
			]
		);
	});

	it('should parse tables with caption', () => {
		assert.deepEqual(
			parseOrThrow(`{|
|+ Caption
| Content
|}`),
			[{type: 'table', attributes: {}, caption: ['Caption'], content: [
				{type: 'table-row', attributes: {}, content: [
					{type: 'table-cell', header: false, attributes: {}, content: ['Content']},
				]},
			]}]
		);
	});

	it('should parse tables with double marks', () => {
		assert.deepEqual(
			parseOrThrow(`{| class="wikitable"
|-
 ! a !! b
 |- style=""
	| 1|| 2
 |}`),
			[
				{type: 'table', attributes: {class: 'wikitable'}, caption: [], content: [
					{type: 'table-row', attributes: {}, content: [
						{type: 'table-cell', header: true, attributes: {}, content: ['a']},
						{type: 'table-cell', header: true, attributes: {}, content: ['b']},
					]},
					{type: 'table-row', attributes: {style: ''}, content: [
						{type: 'table-cell', header: false, attributes: {}, content: ['1']},
						{type: 'table-cell', header: false, attributes: {}, content: ['2']},
					]},
				]},
			]
		);
	});

	it('should parse <gallery>', () => {
		assert.deepEqual(
			parseOrThrow(`<gallery widths="123" heights=456>
first.png
second.jpg|Title

</gallery>`),
			[
				{type: 'gallery', attributes: {widths: '123', heights: '456'}, items: [
					{type: 'link', to: 'first.png', content: []},
					{type: 'link', to: 'second.jpg', content: ['Title']},
				]},
			]
		);

		assert.deepEqual(
			parseOrThrow(`<gallery>
a
|
b|c
</gallery>`),
			[
				{type: 'gallery', attributes: {}, items: [
					{type: 'link', to: 'a', content: []},
					{type: 'link', to: 'b', content: ['c']},
				]},
			]
		);
	});

	it('should parse <syntaxhighlight>', () => {
		assert.deepEqual(
			parseOrThrow(`<syntaxhighlight lang="c">
#include <stdio.h>

int main() {
	printf("<h1>Hello, World!</h1>\n");
	return 0;
}
</syntaxhighlight>`),
			[
				{
					type: 'syntaxhighlight',
					attributes: {
						lang: 'c',
					},
					content: [
`#include <stdio.h>

int main() {
	printf("<h1>Hello, World!</h1>\n");
	return 0;
}`,
					],
				}
			],
		);
	});

	it('should parse <code>', () => {
		assert.deepEqual(
			parseOrThrow(`<code><html></code>`),
			[{type: 'code', content: ['<html>'], attributes: {}}]
		);
	});
});
