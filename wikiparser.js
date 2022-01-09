'use strict'

const util = require('util');
const {Parser} = require('./parser');

const kEmpty = Object.freeze([]);

class WikiParser extends Parser {
	constructor(options = {}) {
		super(options);

		this.grammar = [
			{type: 'link', start: '[[', func: () => this.link()},
			{type: 'externalLink', start: '[',
				postCondition: () => this.startsWithRegex(/((https?|ftps?|sftp|git|svn|ircs?):)?\/\/|(mailto|magnet|tel|urn|xmpp|geo):/yi),
				func: () => this.externalLink()},
			{type: 'boldItalics', start: "'''''", end: ["'''''"], stop: [']]'], backtrackOn: this.isEndOfLine},
			{type: 'bold', start: "'''", end: ["'''"], stop: [']]'], backtrackOn: this.isEndOfLine},
			{type: 'italics', start: "''", end: ["''"], notEnd: ["'''"], stop: [']]'], disallow: ['preformatted'], backtrackOn: this.isEndOfLine},
			{type: 'template', start: '{{', func: () => this.template()},
			{type: 'templatePreformatted', start: '{{', func: () => this.template(kEmpty), postProcess: node =>
				Object.assign({}, node, {type: 'template'})},
			{type: 'unorderedList', start: '*', keepStart: true, preCondition: this.isStartOfLine, func: () => this.list('*')},
			{type: 'orderedList', start: '#', keepStart: true, preCondition: this.isStartOfLine, func: () => this.list('#')},
			{type: 'indent', start: ':', keepStart: true, preCondition: this.isStartOfLine, func: () => this.indent()},
			{type: 'description', start: ';', preCondition: this.isStartOfLine, func: () => this.description()},
			{type: 'heading', start: '=', keepStart: true, preCondition: this.isStartOfLine, func: () => this.heading()},
			{name: 'htmlEntities', start: '&', group: [
				{type: 'nbsp', start: 'nbsp;', replaceWith: ' '},
				{type: 'lt', start: 'lt;', replaceWith: '<'},
				{type: 'gt', start: 'gt;', replaceWith: '>'},
				{type: 'mdash', start: 'mdash;', replaceWith: '—'},
				{type: 'ndash', start: 'ndash;', replaceWith: '–'},
				{type: 'minus', start: 'minus;', replaceWith: '−'},
				{type: 'thinsp', start: 'thinsp;', replaceWith: ' '},
				{type: 'htmlEntity', start: '#', func: () => this.htmlEntity()},
			]},
			{type: 'toc', start: '__TOC__', end: ['']},
			{type: 'notoc', start: '__NOTOC__', end: ['']},
			{type: 'preformatted', start: ' ', keepStart: true, preCondition: this.isStartOfLine, func: () => this.preformatted()},
			{name: 'tags', start: '<', keepStart: true, group: [
				{type: 'comment', start: '<!--', end: ['-->'], allow: kEmpty, postProcess: node =>
					Object.assign({}, node, {content: node.content.map(x => x.replace(/^[\s-]+|[\s-]+$/g, ''))})},
				{type: 'lineBreak', start: '<br', postCondition: () => this.isAfterTagName(), end: ['>'], postProcess: ({content, ...rest}) => rest},
				{type: 'hr', start: '<hr', keepStart: true, func: () => this.tag({only: ['hr'], hasContent: false})},
				{type: 'source', start: '<source', keepStart: true, func: () => this.tag({only: ['source'], type: 'source', allow: kEmpty})},
				{type: 'math', start: '<math', keepStart: true,
					func: () => this.tag({only: ['math'], type: 'math', disallow: ['template', 'templatePreformatted']})},
				{type: 'ref', start: '<ref', keepStart: true, func: () => this.tag({only: ['ref'], type: 'ref'})},
				{type: 'nowiki', start: '<nowiki', keepStart: true, func: () => this.tag({only: ['nowiki'], type: 'nowiki', allow: kEmpty}),
					postProcess: node => node.content != null ? node : []},
				{type: 'pre', start: '<pre', keepStart: true, func: () => this.tag({only: ['pre'], type: 'pre', allow: kEmpty, trim: false})},
				{type: 'syntaxhighlight', start: '<syntaxhighlight', keepStart: true, func: () => this.tag({only: ['syntaxhighlight'],
					type: 'syntaxhighlight', allow: kEmpty})},
				{type: 'code', start: '<code', keepStart: true, func: () => this.tag({only: ['code'], type: 'code', allow: kEmpty})},
				{type: 'gallery', start: '<gallery', postCondition: () => this.isAfterTagName(), func: () => this.gallery()},
				{type: 'tag', start: '<', keepStart: true, func: () => this.tag()},
			]},
			{type: 'table', start: '{|', func: () => this.table()},
			{type: 'horizontalRule', start: '----', preCondition: this.isStartOfLine},
		];
	}

	template(allow = null) {
		const nameContentRaw = this.next({endBefore: ['|', '}}'], allow: ['comment', 'template']});

		if (!nameContentRaw) {
			return null;
		}

		const nameContent = nameContentRaw.filter(part => part.type !== 'comment');

		if (!nameContent.length) {
			return null;
		}

		const name = nameContent[0].trim().toLowerCase();

		if (!name) {
			return null;
		}

		if (name === 'code') {
			allow = kEmpty;
		}

		const parameters = {};
		const positionalParameters = [];
		this.eatWhitespace();

		while (this.eat('|', false)) {
			const originalPos = this.pos;
			const nameContent = this.next({end: ['='], stop: ['|', '{{', '}}', '<'], allow: ['comment'], backtrackOn: this.isEndOfLine});

			if (nameContent && nameContent.length) {
				const name = nameContent[0].trim().toLowerCase();

				if (name) {
					const value = this.trim(this.next({endBefore: ['|', '}}'], allow, disallow: ['preformatted']}));

					if (isNaN(name)) {
						parameters[name] = value;
					} else {
						positionalParameters[name - 1] = value;
					}

					continue;
				}
			}

			this.pos = originalPos;
			positionalParameters.push(this.trim(this.next({endBefore: ['|', '}}'], allow, disallow: ['preformatted']})));
		}

		if (!this.eat('}}', false)) {
			return null;
		}

		return {name, parameters, positionalParameters};
	}

	link() {
		const page = this.next({endBefore: ['|', ']]'], allow: ['nbsp'], backtrackOn: this.isEndOfLine});

		if (!page) {
			return null;
		}

		const parameters = {};
		const positionalParameters = [];

		while (this.eat('|', false)) {
			const originalPos = this.pos;
			const nameContent = this.next({end: ['='], stop: ['|', '[[', ']]', '<'], allow: ['comment'], backtrackOn: this.isEndOfLine});

			if (nameContent && nameContent.length) {
				const name = nameContent[0].trim().toLowerCase();

				if (name) {
					const value = this.trim(this.next({endBefore: ['|', ']]'], disallow: ['preformatted']}));

					if (isNaN(name)) {
						parameters[name] = value;
					} else {
						positionalParameters[name - 1] = value;
					}

					continue;
				}
			}

			this.pos = originalPos;
			positionalParameters.push(this.trim(this.next({endBefore: ['|', ']]'], disallow: ['preformatted']})));
		}

		if (!this.eat(']]', false)) {
			return false;
		}

		if (!page.length) {
			return null;
		}

		const [to, anchor] = page[0].trim().split('#');
		const content = positionalParameters.length ? positionalParameters.pop() : [to];

		while (!this.isEnd() && this.str[this.pos.offset].match(/^\w/)) {
			this.append(content, this.advance(this.str[this.pos.offset]));
		}

		const link = {to, content};

		if (anchor) {
			link.anchor = anchor;
		}

		if (Object.keys(parameters).length) {
			link.parameters = parameters;
		}

		if (positionalParameters.length) {
			link.positionalParameters = positionalParameters;
		}

		return link;
	}

	externalLink() {
		const uri = this.next({end: [' ', '\t'], endBefore: [']'], allow: ['comment']});

		if (!uri) {
			return null;
		}

		const content = this.trim(this.next({end: [']'], backtrackOn: this.isEndOfLine})) || [];
		return {uri: uri.filter(part => typeof part === 'string').join(''), content};
	}

	tag({only = null, hasContent = true, type = 'tag', allow, disallow = ['preformatted'], endBefore = ['\n|', '\n!'], trim = true} = {}) {
		this.eat('<');

		if (this.isEnd() || !this.str[this.pos.offset].match(/^[a-z-]/i)) {
			return null;
		}

		const tag = this.next({endBefore: [' ', '\t', '>', '/'], backtrackOn: this.isEndOfLine});

		if (!tag || typeof tag[0] !== 'string') {
			return null;
		}

		const name = tag[0].toLowerCase();

		if (!name || !this.isAfterTagName() || only && !only.includes(name)) {
			return null;
		}

		const attributes = this.attributes(['/>', '/ >', '>']);

		if (this.eatAny(['/>', '/ >'], false)) {
			return Object.assign({type, attributes, selfClosing: true}, type === 'tag' ? {name} : {});
		}

		if (!this.eat('>', false)) {
			return null;
		}

		if (!hasContent) {
			return Object.assign({type, attributes}, type === 'tag' ? {name} : {});
		}

		let content = this.next({endAtEos: true, endBefore: [...endBefore, '</' + name, ']]', '}}'], allow, disallow});

		if (trim) {
			content = this.trim(content);
		}

		if (content == null) {
			return null;
		}

		if (!this.isEnd() && !this.eat('</' + name + '>', false)) {
			if (this.eat('</' + name, false)) {
				this.eatWhitespace();

				if (!this.eat('>', false)) {
					return null;
				}
			}
		}

		return Object.assign({type, content, attributes}, type === 'tag' ? {name} : {});
	}

	attributes(endBefore = kEmpty, closeQuoteOnNewline = false) {
		const attributes = {};
		this.eatWhitespace(false);

		while (!this.isEnd() && !this.startsWithAny(endBefore)) {
			this.eatWhitespace(false);
			const nameContent = this.trim(this.next({end: [' ', '\t'], endBefore: [...endBefore, '=']}));
			this.eatWhitespace(false);

			if (nameContent == null || !nameContent.length) {
				break;
			}

			const [name] = nameContent;

			if (!this.eat('=', false)) {
				attributes[name] = true;
				continue;
			}

			this.eatWhitespace(false);
			let value;

			if (this.startsWith('"')) {
				value = this.quotedString(closeQuoteOnNewline);
			} else {
				value = this.next({end: [' ', '\t'], endBefore});
				value = value ? value[0] : null;
			}

			if (value == null) {
				break;
			}

			attributes[name] = value;
		}

		return attributes;
	}

	quotedString(closeQuoteOnNewline = false) {
		this.eat('"');
		const content = this.next({end: ['"'], endBefore: closeQuoteOnNewline ? ['\n'] : kEmpty,
			stop: closeQuoteOnNewline ? kEmpty : ['\n'], allow: kEmpty});
		return content != null ? content[0] || '' : null;
	}

	isAfterTagName() {
		return this.startsWithAny([' ', '>', '/>', '/ >', '\t']);
	}

	list(character) {
		const items = [];

		while (this.isStartOfLine() && this.startsWith(character)) {
			const level = this.eatCount(character);
			let content = [];

			if (this.startsWith(':')) {
				this.append(content, [Object.assign({type: 'indent'}, this.indent(true))]);
			}

			this.append(content, this.next({end: ['\n'], endAtEos: true, endBefore: ['}}', '</']}));
			content = this.trim(content);
			items.push({level, content});
		}

		return {items};
	}

	indent(start = false) {
		const items = [];

		while ((start || this.isStartOfLine()) && this.startsWith(':')) {
			const level = this.eatCount(':');
			const content = this.trim(this.next({end: ['\n'], endAtEos: true, endBefore: ['}}', '</']}));
			items.push({level, content});
		}

		return {items};
	}

	description() {
		const title = this.trim(this.next({end: ['\n'], endAtEos: true, endBefore: [':']}));

		if (title == null) {
			return null;
		}

		let content = [];

		if (this.eat(':', false)) {
			content = this.trim(this.next({end: ['\n'], endAtEos: true}));
		}

		return {title, content};
	}

	heading() {
		const level = this.eatCount('=');
		const content = this.trim(this.next({endBefore: ['='], backtrackOn: this.isEndOfLine}));

		if (!this.eat('='.repeat(level), false)) {
			return null;
		}

		this.eat('\n', false);
		return {level, content};
	}

	preformatted() {
		const content = [];

		while (this.isStartOfLine() && this.startsWith(' ')) {
			this.eat(' ');

			let line = this.next({end: ['\n'], endAtEos: true, allow: ['lineBreak', 'templatePreformatted', 'comment', 'link', 'bold', 'italics']});

			if (line == null) {
				line = this.next({end: ['\n'], endAtEos: true, allow: kEmpty});
			}

			this.append(content, [...line, '\n']);
		}

		return content;
	}

	htmlEntity() {
		const isHex = this.eat('x', false);
		const digits = this.next({end: [';'], backtrackOn: this.isEndOfLine});

		if (!digits) {
			return null;
		}

		return String.fromCharCode(parseInt(digits, isHex ? 16 : 10));
	}

	table() {
		const content = [];
		const attributes = this.attributes(['\n']);
		this.eat('\n', false);
		let caption = [];
		this.eatWhitespace();

		if (this.eat('|+', false)) {
			caption = this.trim(this.next({end: ['\n']}));
		}

		do {
			const commentsBefore = this.eatComments();
			const row = this.tableRow(!content.length && !this.startsWith('|-'));

			if (row == null) {
				return null;
			}

			const comments = [...commentsBefore, ...(row.comments || []), ...this.eatComments()];

			if (comments.length) {
				row.comments = comments;
			}

			content.push(row);
		} while (this.startsWith('|-'));

		if (!this.eat('|}', false)) {
			return null;
		}

		return {type: 'table', attributes, caption, content};
	}

	tableRow(started = false) {
		const content = [];
		const comments = [];
		let attributes = {};

		if (!started) {
			this.eat('|-');
			this.eatCount('-');
			attributes = this.attributes(['\n'], true);

			if (!this.eat('\n', false)) {
				return null;
			}

			this.eatComments(comments);
		}

		do {
			this.eatWhitespace();

			if (!this.startsWithAny(['|', '!']) || this.startsWithAny(['|-', '|}'])) {
				break;
			}

			const header = this.eat('!', false);

			if (!header) {
				this.eat('|');
			}

			this.eatWhitespace(false);
			const originalPos = this.pos;
			let attributes = this.attributes(['|', '!!', '\n']);

			if (this.startsWith('||') || !this.eat('|', false)) {
				this.pos = originalPos;
				attributes = {};
			}

			while (this.startsWith('\n')) {
				this.eat('\n');
			}

			const cell = this.trim(this.next({end: ['\n'], endBefore: ['|', '!!'], disallow: ['preformatted']}));

			if (cell == null) {
				return null;
			}

			if (this.startsWith('||')) {
				this.eat('|');
			} else if (this.startsWith('!!')) {
				this.eat('!');
			}

			content.push({type: 'table-cell', header, attributes, content: cell});
		} while (!this.isEnd() && !this.startsWith('|}'));

		return {type: 'table-row', attributes, content, ...(comments.length ? {comments} : {})};
	}

	gallery() {
		const items = [];
		const attributes = this.attributes(['>']);

		if (!this.eat('>', false)) {
			return null;
		}

		this.eatWhitespace();

		while (this.isStartOfLine()) {
			this.eatWhitespace();

			if (this.startsWith('</gallery>')) {
				break;
			}

			const toRaw = this.next({end: ['\n'], endBefore: ['|', '</gallery>']});

			if (!toRaw) {
				return null;
			}

			const to = this.trim(toRaw)[0];

			if (!to) {
				if (!this.eat('|', false)) {
					return null;
				}

				this.eatWhitespace();
				continue;
			}

			let content = [];

			if (this.eat('|', false)) {
				content = this.trim(this.next({end: ['\n'], endBefore: ['</gallery>']}));
			}

			items.push({type: 'link', to, content});
		}

		if (!this.eat('</gallery>', false)) {
			return null;
		}

		return {attributes, items};
	}

	eatComments(comments = []) {
		this.eatWhitespace();

		while (this.startsWith('<!--')) {
			const comment = this.node(['comment']);

			if (!comment) {
				return comments;
			}

			comments.push(comment);
			this.eatWhitespace();
		}

		return comments;
	}
}

function parse(str, options = {}) {
	const parser = new WikiParser(options);
	return parser.parse(str);
}

module.exports = {WikiParser, parse}

if (require.main === module) {
	const getStdin = require('get-stdin');

	(async function () {
		const text = await getStdin();
		console.log(util.inspect(parse(text, {throwError: true}), {depth: 20, colors: true, maxArrayLength: Infinity}));
	})().catch(err => {
		console.error(err);
	});
}
