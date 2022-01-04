'use strict'

const {WikiParser, parse} = require('./wikiparser');
const {astToText, nodeToText} = require('./text');

module.exports = {
	WikiParser,
	parse,
	astToText,
	nodeToText,
};
