var Watcher = require('../lib/ide/ws/Watcher');
var root = 'D:\\wsworkspace\\fee-eslint-cli';
var watcher = new Watcher(root, {
    typeObj: {
        js: {
            rule: [],
            ruleDirection: true
        }
    }
});

watcher.writeFile();
