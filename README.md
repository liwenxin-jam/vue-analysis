# vue源码分析

> 此项目是基于[Vue.js技术揭秘](https://github.com/ustbhuangyi/vue-analysis)教程实现vue源码分析。根据教程上讲的知识点，在vue源码上写了点注释。当前项目vue版本是v2.6.10，项目会不定期更新。欢迎大家Star或Fork，欢迎大家Star或Fork，欢迎大家Star或Fork，重要的事说三遍。

## 调试技术
```
 在node_modules下找到vue/dist/vue.esm.js，在你想要打断点的地方加上debugger。注意自己加了debugger，需要重启服务npm run serve才会生效，它是注入到webpack里面了。
```

## Install dependencies node版本建议是LTS，例如8.11.3
```
npm install --registry=https://registry.npm.taobao.org
```

### 本地运行环境Compiles and hot-reloads for development 
```
npm run serve
```
