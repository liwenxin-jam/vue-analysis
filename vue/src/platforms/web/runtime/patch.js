/* @flow */

import * as nodeOps from 'web/runtime/node-ops'
import { createPatchFunction } from 'core/vdom/patch'
import baseModules from 'core/vdom/modules/index'
import platformModules from 'web/runtime/modules/index'

// the directive module should be applied last, after all
// built-in modules have been applied.
const modules = platformModules.concat(baseModules)

// 高阶函数，函数柯里化，通过传递不同平台的模块实现封装
// nodeOps是关于dom节点的封装操作一系列方法
// modules由baseModules和platformModules组成，baseModules是ref、directives这些模块，platformModules是attr、class、dom-props、events、style、transition这些模块
export const patch: Function = createPatchFunction({ nodeOps, modules })
