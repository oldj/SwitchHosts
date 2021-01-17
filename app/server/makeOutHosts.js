/**
 * @author oldj
 * @blog https://oldj.net
 *
 * 输出 hosts，提供给系统等应用
 */

'use strict'

const treeFunc = require('../libs/treeFunc')

function getHostsContent (item) {
  return item.content || ''
}

function parseLine(line){
  if(!line) return false;
  if(/^#/.test(line.trim())) return false;
  const parts = line.trim().split(/\s/).map(v=>v.trim()).filter(v=>v);
  return {
    ip: parts[0],
    domain: parts.slice(1),
  };
}

function normalize(content){
  const usedDomain = [];
  return content.split('\n').map(line => {
    const hosts = parseLine(line);
    let validLineContent = '';
    let invalidLineContent = '';
    // if can not parse as hosts, leave it as it is.
    if(!hosts) return line;

    const ipv = /:/.test(hosts.ip) ? 6 : 4;

    hosts.domain.forEach(domain => {
      const domainV = domain + '_' + ipv;
      if (usedDomain.indexOf(domainV) === -1){
        if (!validLineContent){
          validLineContent = hosts.ip;
        }

        validLineContent += '\t' + domain;
        usedDomain.push(domainV);
      }else{
        if (!invalidLineContent) {
          invalidLineContent = '# ' + hosts.ip;
        }

        invalidLineContent += '\t' + domain;
      }
    });

    if(!invalidLineContent){
      return validLineContent;
    }else{
      return validLineContent + '\n' + '# invalid hosts (repeated)\n' + invalidLineContent;
    }
  }).join('\n');
}

module.exports = (list) => {
  let content = treeFunc.flatTree(list)
    .filter(item => item.on)
    .map(item => getHostsContent(item, list))
    .join('\n\n');
  return normalize(content)
};
