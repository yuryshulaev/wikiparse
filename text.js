'use strict'

function nodeToText(node, opts = {headingCallback: null}) {
	if (typeof node === 'string') {
		return node;
	}

	if (typeof node !== 'object') {
		console.error(node);
		throw new Error('Expected object');
	}

	if (node.constructor === Array) {
		return node.map(item => nodeToText(item, opts)).join('');
	} else if ('items' in node) {
		return node.items.map(item => nodeToText(item, opts) + '\n').join('');
	} else if ('content' in node) {
		if (node.type === 'comment') {
			return '';
		}

		const text = nodeToText(node.content, opts);

		switch (node.type) {
			case 'heading':
				return (opts.headingCallback ? opts.headingCallback(text) : text) + '\n\n';

			case 'table-row':
				return text + '\n';

			case 'table-cell':
				return text + '\t';

			default:
				return text;
		}
	} else if (node.type === 'template') {
		if (['zh', 'lang-zh'].includes(node.name)) {
			const content = node.parameters.c || node.parameters.t || node.parameters.s || node.parameters.p;

			if (content) {
				return nodeToText(content, opts);
			}
		} else if (node.name.match(/^(lang|ipac?)-[a-z]{2}|iast|korean|ipa$/)) {
			return (node.positionalParameters[0] || []).map(item => nodeToText(item, opts)).join('');
		} else if (['bibleverse'].includes(node.name)) {
			return node.positionalParameters.map(item => nodeToText(item, opts)).join(' ');
		} else if (['audio', 'audio-nohelp', 'lang'].includes(node.name) && node.positionalParameters.length >= 2) {
			return nodeToText(node.positionalParameters[1], opts);
		}
	}

	return '';
}

function astToText(ast, ...rest) {
	return nodeToText(ast, ...rest).replace(/\n\s+\n/g, '\n\n');
}

module.exports = {
	nodeToText,
	astToText,
};
