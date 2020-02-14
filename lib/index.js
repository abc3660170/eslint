const DEFAULT_ECMA_VERSION = 2018;
const inquirer = require('inquirer');
const ConfigOps = require('./config-ops.js');
const npmUtils = require('./npm-utils');
const log = require('./logging');
const ConfigFile = require('./config-file');
const WsWatcher = require('../lib/ide/ws/Watcher');

/**
 * process user's answers and create config object
 * @param {Object} answers answers received from inquirer
 * @returns {Object} config object
 */
function genEslintConfig(answers) {
    const config = {
        rules: {},
        env: {},
        parserOptions: {},
        extends: ['fee-base']
    };

    // set the latest ECMAScript version
    config.parserOptions.ecmaVersion = DEFAULT_ECMA_VERSION;
    config.env.es6 = true;
    config.globals = {
        Atomics: 'readonly',
        SharedArrayBuffer: 'readonly'
    };

    // set the module type
    if (answers.moduleType === 'esm') {
        config.parserOptions.sourceType = 'module';
    } else if (answers.moduleType === 'commonjs') {
        config.env.commonjs = true;
    }

    // add in browser and node environments if necessary
    answers.env.forEach(env => {
        config.env[env] = true;
    });

    // add in library information
    if (answers.framework === 'react') {
        config.parserOptions.ecmaFeatures = {
            jsx: true
        };
        config.plugins = ['react'];
    } else if (answers.framework === 'vue') {
        config.plugins = ['vue'];
        config.extends.push('plugin:vue/essential');
    }

    // setup rules based on problems/style enforcement preferences
    if (answers.purpose === 'problems') {
        config.extends.unshift('eslint:recommended');
    }

    if (answers.installedPrettier) {
        config.plugins = [...(config.plugins || []), 'prettier'];
        config.extends.push('prettier');
        config.rules['prettier/prettier'] = 'error';
    }

    // normalize extends
    if (config.extends.length === 0) {
        delete config.extends;
    } else if (config.extends.length === 1) {
        config.extends = config.extends[0];
    }

    ConfigOps.normalizeToStrings(config);
    return config;
}

/**
 * process user's answers and create config object
 * @param {Object} answers answers received from inquirer
 * @returns {Object} config object
 */
function processAnswers(answers) {
    const eslintConfig = genEslintConfig(answers);
    let prettierConfig = null;
    if (answers.installedPrettier) {
        prettierConfig = {
            printWidth: 100,
            bracketSpacing: true,
            semi: true,
            tabWidth: 4,
            singleQuote: true,
            jsxSingleQuote: false,
            jsxBracketSameLine: false,
            arrowParens: 'avoid',
            endOfLine: 'lf'
        };
    }
    return {
        eslintConfig,
        prettierConfig
    };
}

/**
 * Return necessary plugins, configs, parsers, etc. based on the config
 * @param   {Object} eslintConfig  config object
 * @param   {boolean} [installESLint=true]  If `false` is given, it does not install eslint.
 * @returns {string[]} An array of modules to be installed.
 */
function getModulesList(eslintConfig, installESLint) {
    const modules = {};
    const externalModules = ['prettier'];

    // Create a list of modules which should be installed based on config
    if (eslintConfig.plugins) {
        for (const plugin of eslintConfig.plugins) {
            modules[`eslint-plugin-${plugin}`] = 'latest';
            if (externalModules.indexOf(plugin) !== -1) {
                modules[plugin] = 'latest';
            }
        }
    }
    if (Array.isArray(eslintConfig.extends)) {
        eslintConfig.extends.forEach(extend => {
            if (extend.indexOf('eslint:') === -1 && extend.indexOf('plugin:') === -1) {
                const moduleName = `eslint-config-${extend}`;
                modules[moduleName] = 'latest';
            }
        });
    }

    if (installESLint === false) {
        delete modules.eslint;
    } else {
        modules.eslint = 'latest';
    }

    return Object.keys(modules).map(name => `${name}@${modules[name]}`);
}

/**
 * Install modules.
 * @param   {string[]} modules Modules to be installed.
 * @returns {void}
 */
function installModules(modules) {
    log.info(`Installing ${modules.join(', ')}`);
    npmUtils.installSyncSaveDev(modules);
}

/**
 * Ask user to install modules.
 * @param   {string[]} modules Array of modules to be installed.
 * @returns {Promise} Answer that indicates if user wants to install.
 */
function askInstallModules(modules) {
    // If no modules, do nothing.
    if (modules.length === 0) {
        return Promise.resolve();
    }

    log.info('配置中中你选择的引用将会安装以下依赖:\n');
    log.info(modules.join(' '));
    return inquirer
        .prompt([
            {
                type: 'confirm',
                name: 'executeInstallation',
                message: '是否通过npm安装他们?',
                default: true,
                when() {
                    return modules.length;
                }
            }
        ])
        .then(({ executeInstallation }) => {
            if (executeInstallation) {
                installModules(modules);
            }
        });
}

/**
 * Create .eslintrc file in the current working directory
 * @param framework eslint or prettier
 * @param {Object} config object that contains user's answers
 * @param {string} format The file format to write to.
 * @returns {void}
 */
function writeFile(framework, config, format) {
    // default is .js
    let extname = '.js';

    if (format === 'YAML') {
        extname = '.yml';
    } else if (format === 'JSON') {
        extname = '.json';
    }

    const installedESLint = config.installedESLint;

    delete config.installedESLint;

    ConfigFile.write(config, `./.${framework}rc${extname}`);
    log.info(`Successfully created .${framework}rc${extname} file in ${process.cwd()}`);

    if (installedESLint) {
        log.info(
            'ESLint was installed locally. We recommend using this local copy instead of your globally-installed copy.'
        );
    }
}

/**
 * Ask use a few questions on command prompt
 * @returns {Promise} The promise with the result of the prompt
 */
function promptUser(cwd) {
    return inquirer
        .prompt([
            {
                type: 'list',
                name: 'purpose',
                message: '你想用 ESLint 做什么事情?',
                default: 'problems',
                choices: [
                    { name: '只检查语法', value: 'syntax' },
                    {
                        name: '检查语法同时检测可能存在的问题',
                        value: 'problems'
                    }
                ]
            },
            {
                type: 'list',
                name: 'moduleType',
                message: '你的项目是什么模块类型的?',
                default: 'esm',
                choices: [
                    {
                        name: 'JavaScript modules (import/export)',
                        value: 'esm'
                    },
                    { name: 'CommonJS (require/exports)', value: 'commonjs' },
                    { name: '以上都不是', value: 'none' }
                ]
            },
            {
                type: 'list',
                name: 'framework',
                message: '你的项目使用了哪种语言框架?',
                default: 'none',
                choices: [
                    { name: 'React', value: 'react' },
                    { name: 'Vue.js', value: 'vue' },
                    { name: '以上都不是', value: 'none' }
                ]
            },
            {
                type: 'checkbox',
                name: 'env',
                message: '项目代码会跑在什么环境里?',
                default: ['browser'],
                choices: [{ name: '浏览器', value: 'browser' }, { name: 'Node', value: 'node' }]
            },
            {
                type: 'confirm',
                name: 'installedPrettier',
                message: '安装 prettier ?（强烈建议安装，保证代码风格统一）',
                default: true
            },

            {
                type: 'list',
                name: 'format',
                message: 'What format do you want your config file to be in?',
                default: 'JSON',
                choices: ['YAML', 'JSON'],
                when() {
                    return false;
                }
            }
        ])
        .then(earlyAnswers => {
            console.log(earlyAnswers);
            const configs = processAnswers(earlyAnswers);
            const modules = getModulesList(configs.eslintConfig, true);

            return askInstallModules(modules, earlyAnswers.packageJsonExists)
                .then(() => {
                    return new Promise(resolve => {
                        writeFile('eslint', configs.eslintConfig, 'JSON');
                        resolve();
                    });
                })
                .then(() => {
                    return new Promise(resolve => {
                        if (configs.prettierConfig) {
                            writeFile('prettier', configs.prettierConfig, 'JSON');
                        }
                        resolve();
                    });
                })
                .then(() => {
                    return new Promise(resolve => {
                        return watch(cwd);
                    });
                });
        });
}

function watch(cwd) {
    inquirer
        .prompt([
            {
                type: 'confirm',
                name: 'wsWatch',
                message: '是否启用 webstorm 文件监听功能？',
                default: true
            },
            {
                type: 'checkbox',
                name: 'watchList',
                message: '请选择监视文件的类型？',
                choices: [
                    { name: 'JavaScript', value: 'js' },
                    { name: 'Scss', value: 'scss' },
                    { name: 'Markdown', value: 'md' },
                    { name: 'Vue', value: 'vue' }
                ],
                validate: answers => {
                    return answers.length > 0;
                },
                default: ['js', 'scss', 'md'],
                when(answers) {
                    return answers.wsWatch;
                }
            },
            {
                type: 'input',
                name: 'watchMatch',
                when(answers) {
                    return answers.wsWatch;
                },
                message:
                    '请填写需要监控的目录，多个目录/文件用空格隔开，如果是' +
                    '目录别忘了在这个目录的结尾处加上"/",\n  排除在路径最前面加上"!"不用每个目录都加,\n  ' +
                    '因为目前只能做到要么都是include要么都是exclude，而且是级联遍历\n  下面看2个例子：\n    ' +
                    '"packages/ src/ index.js" 这样填写代表我要监控 2个目录和根目录下的一个文件\n    ' +
                    '"!lib/ build/ dist.js" 这样填写代表我要排除 2个目录和根目录下的一个文件\n  ' +
                    '直接回车整个项目全局监控（不推荐）'
            }
        ])
        .then(answers => {
            return new Promise(resolve => {
                if (!answers.wsWatch) {
                    return resolve();
                }
                const watchList = answers.watchList,
                    config = {
                        typeObj: {}
                    };
                let ruleDirection = true,
                    watchMatch = answers.watchMatch;
                if (watchMatch.indexOf('!') === 0) {
                    ruleDirection = false;
                    watchMatch = watchMatch.slice(1);
                }

                const rule = watchMatch.trim() ? watchMatch.split(/\s+/) : [];

                watchList.forEach(fileType => {
                    config.typeObj[fileType] = {
                        rule,
                        ruleDirection
                    };
                });

                const watch = new WsWatcher(cwd, config);
                if (watch.writeFile()) {
                    resolve();
                }
            });
        });
}

module.exports.main = promptUser;
module.exports.watch = watch;
