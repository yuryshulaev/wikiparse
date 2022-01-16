'use strict'

const kEmpty = Object.freeze([]);

class BacktrackingLimitExceededError extends Error {
}

class Parser {
	kDefaultOptions = {
		backtrackingLimit: 50000,
		throwError: false,
		returnError: false,
		debug: false,
	}

	constructor(options = {}) {
		this.options = {...this.kDefaultOptions, ...options};
		this.grammar = [];
	}

	parse(str) {
		this.str = str;
		// Slow, but avoids the problem of length difference:
		// https://stackoverflow.com/questions/69060325/can-tolowercase-change-a-javascript-strings-length
		this.lowercaseStr = str.split('').map(c => c.toLowerCase());
		this.pos = {offset: 0, lineNumber: 1};
		this.backtrackOn = [];
		this.backtrackingCount = 0;
		this.stack = [];

		try {
			return this.next({endAtEos: true});
		} catch (err) {
			if (this.options.throwError) {
				throw err;
			}

			if (this.options.debug) {
				console.error(err);
			}

			return this.options.returnError ? err : null;
		}
	}

	node(allow, disallow = kEmpty, grammar = this.grammar) {
		const originalPos = this.pos;

		for (const nodeType of grammar) {
			if (!this.startsWith(nodeType.start) || nodeType.type && (allow && !allow.includes(nodeType.type) || disallow.includes(nodeType.type))) {
				continue;
			}

			if (nodeType.preCondition && !nodeType.preCondition()) {
				this.pos = originalPos;
				continue;
			}

			if (!nodeType.keepStart) {
				this.eat(nodeType.start);
			}

			if (nodeType.postCondition && !nodeType.postCondition()) {
				this.pos = originalPos;
				continue;
			}

			if (nodeType.group) {
				const result = this.node(allow, disallow, nodeType.group);

				if (result == null) {
					this.pos = originalPos;
					continue;
				}

				return result;
			}

			let content = nodeType.func ? nodeType.func() : this.next(nodeType);

			if (nodeType.replaceWith) {
				return nodeType.replaceWith;
			}

			if (content == null) {
				if (++this.backtrackingCount > this.options.backtrackingLimit) {
					throw new BacktrackingLimitExceededError();
				}

				if (this.options.debug) {
					console.debug(this.backtrackingCount, nodeType.type + ': backtrack from "' + this.str.substr(this.pos.offset, 50) + '"', this.pos);
					console.debug('\tto "' + this.str.substr(originalPos.offset, 50) + '"', originalPos);
				}

				this.pos = originalPos;
				continue;
			}

			if (typeof content === 'object') {
				content = content instanceof Array
					? {type: nodeType.type, content}
					: Object.assign({type: nodeType.type}, content);
			}

			if (nodeType.postProcess) {
				content = nodeType.postProcess(content);
			}

			if (content == null) {
				throw new Error('postProcess must return a valid result (' + nodeType.type + ')');
			}

			return content;
		}

		return null;
	}

	next({end = kEmpty, endAtEos = false, notEnd = kEmpty, endBefore = kEmpty, endBeforeRegex = null, endOn = null, backtrack = kEmpty, allow = null,
	      disallow = kEmpty, backtrackOn = null} = {}) {
		if (!end.length && !endBefore.length && !endBeforeRegex && !endOn && !backtrack.length && !endAtEos) {
			return [];
		}

		const originalPos = this.pos;
		let chunkStart = this.pos.offset;
		let chunkLength = 0;
		const content = [];

		if (backtrackOn) {
			this.backtrackOn.push(backtrackOn);
		}

		for (;;) {
			const eos = this.pos.offset >= this.str.length;

			if (eos && endAtEos) {
				break;
			}

			if (this.backtrackOn.some(x => x()) || this.startsWithAny(backtrack) || eos) {
				if (++this.backtrackingCount > this.options.backtrackingLimit) {
					throw new BacktrackingLimitExceededError();
				}

				if (this.options.debug) {
					console.debug(this.backtrackingCount, 'backtrack from "' + this.str.substr(this.pos.offset, 50) + '"', this.pos);
					console.debug('\tto "' + this.str.substr(originalPos.offset, 50) + '"', originalPos);
				}

				this.pos = originalPos;

				if (backtrackOn) {
					this.backtrackOn.pop();
				}

				return null;
			}

			if (this.startsWithAny(end) && !this.startsWithAny(notEnd)) {
				this.eatAny(end);
				break;
			}

			if (this.startsWithAny(endBefore)) {
				break;
			}

			if (endBeforeRegex && this.startsWithRegex(endBeforeRegex)) {
				break;
			}

			if (endOn && endOn()) {
				break;
			}

			this.stack.push(this.pos);
			const node = this.node(allow, disallow);
			this.stack.pop();

			if (node) {
				if (chunkLength) {
					this.append(content, [this.str.substr(chunkStart, chunkLength)]);
					chunkStart = this.pos.offset;
					chunkLength = 0;
				}

				this.append(content, [].concat(node));
				continue;
			}

			if (!chunkLength) {
				chunkStart = this.pos.offset;
			}

			chunkLength += this.advance(this.str[this.pos.offset]).length;
		}

		if (chunkLength) {
			this.append(content, [this.str.substr(chunkStart, chunkLength)]);
		}

		if (backtrackOn) {
			this.backtrackOn.pop();
		}

		return content;
	}

	append(content, chunks) {
		for (const chunk of chunks) {
			if (typeof chunk === 'string' && content.length && typeof content[content.length - 1] === 'string') {
				content[content.length - 1] += chunk;
			} else {
				content.push(chunk);
			}
		}
	}

	trim(content) {
		if (!content || !content.length) {
			return content;
		}

		if (typeof content[0] === 'string') {
			content[0] = content[0].trimLeft();

			if (!content[0]) {
				content.shift();
			}
		}

		if (typeof content[content.length - 1] === 'string') {
			content[content.length - 1] = content[content.length - 1].trimRight();

			if (!content[content.length - 1]) {
				content.pop();
			}
		}

		return content;
	}

	eatCount(chunk) {
		let count = 0;

		while (this.startsWith(chunk)) {
			this.advance(chunk);
			count++;
		}

		return count;
	}

	eatWhitespace(newLine = true) {
		while (this.eatAny([' ', '\t', ...(newLine ? ['\n'] : kEmpty)], false))
			;
	}

	eatAny(chunks, error = true) {
		for (const chunk of chunks) {
			if (this.startsWith(chunk)) {
				this.advance(chunk);
				return true;
			}
		}

		if (error) {
			this.error('Expected one of ' + chunks.join(', ') + ' on line ' + this.pos.lineNumber);
		}

		return false;
	}

	eat(chunk, error = true) {
		if (this.startsWith(chunk)) {
			this.advance(chunk);
			return true;
		} else if (error) {
			this.error('Expected ' + chunk + ' on line ' + this.pos.lineNumber);
		}

		return false;
	}

	advance(chunk) {
		this.pos = {
			offset: this.pos.offset + chunk.length,
			lineNumber: this.pos.lineNumber + (chunk.match(/\n/g) || kEmpty).length,
		};

		return chunk;
	}

	// Case insensitive, expects prefixes in lowercase
	startsWithAny(prefixes) {
		return prefixes.some(prefix => this.startsWith(prefix));
	}

	// Case insensitive, expects prefix in lowercase
	startsWith(prefix) {
		for (let i = 0; i < prefix.length; i++) {
			if (this.lowercaseStr[this.pos.offset + i] !== prefix[i]) {
				return false;
			}
		}

		return true;
	}

	// Regular expression regex must be sticky (/y)
	startsWithRegex(regex) {
		regex.lastIndex = this.pos.offset;
		return regex.exec(this.str);
	}

	isStartOfLine = () => {
		return this.str.length > 0 && this.str[this.pos.offset - 1] === '\n' || this.isStart();
	}

	isEndOfLine = () => {
		return this.isEnd() || this.str[this.pos.offset] === '\n';
	}

	isStart() {
		return this.pos.offset === 0;
	}

	isEnd() {
		return this.pos.offset >= this.str.length;
	}

	error(err) {
		const annotatedStack = this.stack.concat([this.pos]).reverse().map(pos => Object.assign({}, pos, {text: this.str.substr(pos.offset, 100)}));
		throw new Error(err + '\n' + JSON.stringify(annotatedStack, null, 4));
	}
}

module.exports = {Parser};
