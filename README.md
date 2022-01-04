# wikiparse — Wikipedia/MediaWiki syntax parser

Converts wiki markup into a JSON abstract syntax tree or plain text.

## Installation

```
npm i wikiparse
```

## Basic usage

```javascript
import {parse} from 'wikiparse';

const ast = parse(`'''Cats''', also called '''domestic cats''' (''Felis catus''), are small, [[carnivore|carnivorous]] [[mammal]]s`);
console.log(ast);
```

```json
[
  {"type": "bold", "content": ["Cats"]},
  ", also called ",
  {"type": "bold", "content": ["domestic cats"]},
  " (",
  {"type": "italics", "content": ["Felis catus"]},
  "), are small, ",
  {"type": "link", "to": "carnivore", "content": ["carnivorous"]},
  " ",
  {"type": "link", "to": "mammal", "content": ["mammals"]}
]
```

## Getting plain text content

```javascript
import {astToText} from 'wikiparse';

console.log(astToText(ast));
```

```
Cats, also called domestic cats (Felis catus), are small, carnivorous mammals
```

## Parsing a Wikipedia article

```javascript
import fetch from 'node-fetch';
import WikiParser, {astToText} from 'wikiparse';

const wiki = 'simple';
const page = 'Cat';
const url = `https://${wiki}.wikipedia.org/w/api.php?&action=query&titles=${encodeURIComponent(page)}&prop=revisions&rvprop=content&format=json`;
// If you need lots of pages, use XML dumps from https://dumps.wikimedia.org/
const json = await (await fetch(url)).json();
const source = Object.entries(json.query.pages)[0][1].revisions[0]['*'];

const parser = new WikiParser();
const ast = parser.parse(source);
console.log(JSON.stringify(ast, null, 2));
console.log(astToText(ast));

```

Output: [JSON](https://gist.github.com/yuryshulaev/1357f8b2a1d0a3a6890a4ada953f544c), [Text](https://gist.github.com/yuryshulaev/257a3900f825ea0b72f88e0fc8b70a1a).

## Importing Wikipedia dumps

You can use [wiki-import](https://github.com/yuryshulaev/wiki-import) to parse and import a whole Wikipedia dump into LevelDB (or something else with minor code modifications).
