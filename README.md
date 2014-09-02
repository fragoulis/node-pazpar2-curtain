pazpar2-curtain
============

A wrapper for the `pazpar2` client with a simple interface.

## Installation

`npm install pazpar2-curtain --save`

## Usage

Initialize the connection by either requesting a new session which you can read later by doing `curtain.session` or by passing an old session.

```javascript
var pz2 = require('pazpar2-curtain');

var curtain = new Curtain({
    // session: old session,
    terms: ['subject', 'author']
});
```

Perform a search and optionally provide an error and a progress callbacks.


```javascript
var curtain.search('my search').
    .then(function(results) {

    }, function(error) {
        // handle error
    }, function(stat) {
        // handle progress
    });

```

The `results` object consists of two keys, namely: `show` and `termlist`

Example of `show` object:
```
{ 
    status: 'OK',
    activeclients: 0,
    merged: 1,
    total: 1,
    start: 0,
    num: 1,
    hit: [ 
        { 
            title: 'Saint John Perse ο Λόγος και η \'Αβυσσος : οντολογική εισαγωγή στη φιλοσοφία της ποίησης. --Αθήνα : Καρδαμίτσας, 1990',
            author: [Object],
            publisher: [Object],
            year: '1990',
            count: 1,
            relevance: 23104,
            recid: 'content: 9930',
            recno: 9930,
            holdings: [
                { 
                    source: '83.212.110.231:2828/serres',
                    checksum: '1738026072',
                    digital: [ 
                        'GRSER_00000000000000334_:28:GRSER_00000000000000334__00002.jp2',
                        'GRSER_00000000000000282_:20:GRSER_00000000000000282__00002.jp2'
                    ] 
                }
            ] 
        } 
    ] 
}

```

Example of `termlist` object:
```
{ 
    subject: [ 
        { 'Ποίηση': 1 }, 
        { 'Φιλοσοφία ': 1 } 
    ],
    author_070: [ 
        { 'Σπαντίδου, Κωνσταντίνα': 1 } 
    ] 
}
```

## Tests

`npm test`

## Release History

* 0.1.0
 * Initial release