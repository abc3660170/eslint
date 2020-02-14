const fs = require('fs');
const path = require('path');
const log = require('../../logging');
const glob = require('glob');
const cheerio = require('cheerio');

// webstorm 文件监听规则标示符
const SCOPENAME = {
    js: 'prettier-js',
    scss: 'prettier-scss',
    md: 'prettier-md',
    vue: 'prettier-vue'
};

module.exports = class Watch {
    /**
   * @author tchen
   * @param {string} root 项目的根路径
   * @param {{
       typeObj:
         {
            name:{
                scopeName: {string},
                rule: {array},
                ruleDirection: {string}
             }
         }
   * }} config
   */
    constructor(root, config = {}) {
        this.root = root;
        this.config = config;
        this.normalizedConfig();
        this.wsConfig = this.getWSConfig(root);
    }

    normalizedConfig() {
        const config = this.config;
        for (let key in config.typeObj) {
            const typeConfig = config.typeObj[key];
            if (!SCOPENAME[key]) {
                log.error(`${key}:此类型尚未在SCOPENAME中配置！skip~`);
                delete config.typeObj[key];
                continue;
            }
            typeConfig['scopeName'] = SCOPENAME[key];
        }
    }

    /**
     * 生成xml配置
     */
    genWatchXml() {
        const config = this.config.typeObj;
        let options = '';
        for (let key in config) {
            options += Watch.genOptions(key, config[key]);
        }
        return `<?xml version="1.0" encoding="UTF-8"?>
        <project version="4">
          <component name="ProjectTasksOptions">
            ${options}
          </component>
        </project>`;
    }

    writeFile() {
        // 在 idea 配置文件 workspace.xml 中追加组件配置

        //NamedScopeManager中追加 $scopeName 的配置项，规则通过typeConf中的rule获取
        const root = this.root;
        // 检测idea项目配置是否存在
        if (!this.wsConfig) return log.error('这不是一个webstorm项目！');

        //在idea 项目中创建 watcherTasks.xml 文件option.scopeName = $scopeName
        const outputConfig = path.resolve(root, '.idea/watcherTasks.xml');
        const xml = this.genWatchXml();
        fs.writeFileSync(outputConfig, xml, 'utf-8');
        log.info('WS的监听文件创建完成', outputConfig);
        this.addRuletoWorkspace();
        return true;
    }

    addRuletoWorkspace() {
        const config = this.config.typeObj;
        const { workspaceConfig, projectConfig } = this.wsConfig;
        let workspaceStr = fs.readFileSync(workspaceConfig, 'utf-8');
        const $ = (this.$workspace = cheerio.load(workspaceStr, {
            xmlMode: true
        }));
        let scopes = '';
        for (let key in config) {
            const name = path.basename(projectConfig).match(/[^\.]+/)[0];
            scopes += Watch.genScopes(config[key], name);
        }
        this.cleanNamedScope();
        $('[name="NamedScopeManager"]').append(scopes);
        fs.writeFileSync(workspaceConfig, $.xml(), 'utf-8');
        log.info('WS的workspace文件创建完成', workspaceConfig);
        return true;
    }

    cleanNamedScope() {
        const $ = this.$workspace;
        if ($('[name="NamedScopeManager"]').length === 0) {
            $('project').append('<component name="NamedScopeManager"></component>');
        }
        for (let key in SCOPENAME) {
            const selector = `[name="${SCOPENAME[key]}"]`;
            if ($(selector).length > 0) {
                $(selector).remove();
            }
        }
    }

    /**
     * 生成单条监控规则
     * @param {{
     *   scopeName: {string}
     *   rule: {array},
     *   ruleDirection: {string}
     * }}config
     * @returns {string}
     */
    static genScopes(config, projectName) {
        const { scopeName, ruleDirection, rule } = config;
        const ruleArr = rule;
        let joinTag = '||';
        let formatRuleArr;
        // 用户没有手动输入映射规则按照默认的规则来配置
        if (rule.length === 0) {
            joinTag = '&&';
            formatRuleArr = [
                `!file[${projectName}]:node_modules//*`,
                `!file[${projectName}]:.git//*`,
                `!file[${projectName}]:.svn//*`
            ];
        } else {
            formatRuleArr = ruleArr.map(rule => {
                let normallizedRule = '';

                if (!ruleDirection) {
                    normallizedRule = '!';
                    joinTag = '&&';
                }

                let tmpRule = rule;
                if (/\/$/.test(tmpRule)) {
                    // 匹配目录
                    while (tmpRule[tmpRule.length - 1] === '/') {
                        tmpRule = tmpRule.slice(0, -1);
                    }
                    normallizedRule += `file[${projectName}]:${tmpRule}//*`;
                } else {
                    // 匹配单个文件
                    normallizedRule += `file:${tmpRule}`;
                }
                return normallizedRule;
            });
        }
        return `\n\t<scope name="${scopeName}" pattern="${formatRuleArr.join(joinTag)}" />\n`;
    }

    /**
     * 读取项目的必要的.idea配置
     * @param root
     * @returns {boolean|{projectConfig: *, workspaceConfig: *}}
     */
    getWSConfig(root) {
        let workspaceConfig = path.resolve(root, '.idea/workspace.xml');
        let projectConfig = path.resolve(root, '.idea/*.iml');
        projectConfig = glob.sync(projectConfig);
        workspaceConfig = glob.sync(workspaceConfig);
        if (projectConfig.length === 1 && workspaceConfig.length === 1) {
            return {
                projectConfig: projectConfig[0],
                workspaceConfig: workspaceConfig[0]
            };
        } else {
            return false;
        }
    }

    /**
     * 生成js文件的watch配置项
     * @param type 文件后缀类型
     * @param {{ scopeName: {string} }} options
     */
    static genOptions(type, options) {
        return `\n<TaskOptions isEnabled="true">
        <option name="arguments" value="--write $FilePathRelativeToProjectRoot$" />
        <option name="checkSyntaxErrors" value="true" />
        <option name="description" />
        <option name="exitCodeBehavior" value="ERROR" />
        <option name="fileExtension" value="${type}" />
        <option name="immediateSync" value="false" />
        <option name="name" value="fee-prettier-${type}" />
        <option name="output" value="$FilePathRelativeToProjectRoot$" />
        <option name="outputFilters">
        <array />
        </option>
        <option name="outputFromStdout" value="false" />
        <option name="program" value="$ProjectFileDir$/node_modules/.bin/prettier" />
        <option name="runOnExternalChanges" value="true" />
        <option name="scopeName" value="${options.scopeName}" />
        <option name="trackOnlyRoot" value="false" />
        <option name="workingDir" value="$ProjectFileDir$" />
        <envs />
      </TaskOptions>\n`;
    }
};
