/* @flow */

/**
 * 为Vue.prototype.__patch__提供方法
 * 实际方法在vdom/patch中
 */
import * as nodeOps from 'web/runtime/node-ops'
import { createPatchFunction } from 'core/vdom/patch'
import baseModules from 'core/vdom/modules/index'
import platformModules from 'web/runtime/modules/index'

// the directive module should be applied last, after all
// built-in modules have been applied.
const modules = platformModules.concat(baseModules)

// 高阶函数，实参就是函数
// nodeOps 是操作dom的一系列方法
// modules 基础模块+平台模块
// 函数柯里化的技巧，抹平平台差异化的东西 实现类似if(web){} else if(weex){}逻辑 不需要在每次在patch都去判断是什么平台
export const patch: Function = createPatchFunction({ nodeOps, modules })
