/* @flow */

/**
 * 为Vue.prototype.__patch__提供方法
 * 实际方法在vdom/patch中
 */

// node节点操作方法
import * as nodeOps from 'web/runtime/node-ops'
import { createPatchFunction } from 'core/vdom/patch'
// baseModules返回一个数组   ref, directives更新操作工具方法
import baseModules from 'core/vdom/modules/index'
// platformModules返回一个数组， 定义了 attrs, klass, events, domProps, style, transition 的更新操作工具方法
import platformModules from 'web/runtime/modules/index'

// the directive module should be applied last, after all
// built-in modules have been applied.
// 合并所有DOM操作工具模块
const modules = platformModules.concat(baseModules)

// 高阶函数，实参就是函数，nodeOps 是操作dom的一系列方法 modules 基础模块+平台模块
// 函数柯里化的技巧，抹平平台差异化的东西 实现类似if(web){} else if(weex){}逻辑 不需要在每次在patch都去判断是什么平台
// 函数createPatchFunction内会返回一个patch函数
// patch函数接收4个参数 return function patch (oldVnode, vnode, hydrating, removeOnly)
export const patch: Function = createPatchFunction({ nodeOps, modules })
