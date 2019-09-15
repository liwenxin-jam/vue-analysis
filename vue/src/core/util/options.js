/* @flow */

import config from '../config'
import { warn } from './debug'
import { set } from '../observer/index'
import { unicodeRegExp } from './lang'
import { nativeWatch, hasSymbol } from './env'

import {
  ASSET_TYPES,
  LIFECYCLE_HOOKS
} from 'shared/constants'

import {
  extend,
  hasOwn,
  camelize,
  toRawType,
  capitalize,
  isBuiltInTag,
  isPlainObject
} from 'shared/util'

/**
 * Option overwriting strategies are functions that handle
 * how to merge a parent option value and a child option
 * value into the final value.
 */
const strats = config.optionMergeStrategies

/**
 * Options with restrictions
 */
if (process.env.NODE_ENV !== 'production') {
  strats.el = strats.propsData = function (parent, child, vm, key) {
    // 没有传vm说明 不是实例化时候 调用的mergeOptions
    if (!vm) {
      warn(
        `option "${key}" can only be used during instance ` +
        'creation with the `new` keyword.'
      )
    }
    // 采用默认的策略
    return defaultStrat(parent, child)
  }
}

/**
 * Helper that recursively merges two data objects together.
 */
// 将from的属性添加到to上，最后返回to
function mergeData (to: Object, from: ?Object): Object {
  // 如果没有from、直接返回to
  if (!from) return to
  let key, toVal, fromVal

  // 取到from的key值，用于遍历
  const keys = hasSymbol
    ? Reflect.ownKeys(from)
    : Object.keys(from)

  for (let i = 0; i < keys.length; i++) {
    key = keys[i]
    // in case the object is already observed...
    // 对象被观察了，会有__ob__属性，__ob__不作处理
    if (key === '__ob__') continue
    toVal = to[key]
    fromVal = from[key]
    // 如果to上没有该属性，则直接将from对应的值赋值给to[key]
    if (!hasOwn(to, key)) {
      set(to, key, fromVal)
    } else if (
      toVal !== fromVal &&
      isPlainObject(toVal) &&
      isPlainObject(fromVal)
    ) {
      // 如果 to、from都有值，并且不相同，而且都是纯对象的话，
      // 则递归调用mergeData进行合并
      mergeData(toVal, fromVal)
    }
  }
  return to
}

/**
 * Data
 */
export function mergeDataOrFn (
  parentVal: any,
  childVal: any,
  vm?: Component
): ?Function {
  // 没有vm参数，代表是用 Vue.extend、Vue.mixin合并
  if (!vm) {
    // in a Vue.extend merge, both should be functions
    // 如果没有childVal,返回parentVal
    if (!childVal) {
      return parentVal
    }
    // 如果没有parentVal,返回childVal
    if (!parentVal) {
      return childVal
    }
    // when parentVal & childVal are both present,
    // we need to return a function that returns the
    // merged result of both functions... no need to
    // check if parentVal is a function here because
    // it has to be a function to pass previous merges.
    // 返回一个合并data函数
    return function mergedDataFn () {
      // 当调用mergedDataFn才会执行mergeData
      return mergeData(
        typeof childVal === 'function' ? childVal.call(this, this) : childVal,
        typeof parentVal === 'function' ? parentVal.call(this, this) : parentVal
      )
    }
  } else {
    // 返回一个合并data函数
    return function mergedInstanceDataFn () {
      // instance merge
      // 实例化合并，判断是否是函数，函数执行得到对象。
      const instanceData = typeof childVal === 'function'
        ? childVal.call(vm, vm)
        : childVal
      const defaultData = typeof parentVal === 'function'
        ? parentVal.call(vm, vm)
        : parentVal
      if (instanceData) {
        // 如果子选项data有值，则通过mergeData合并。
        // 当调用mergedInstanceDataFn才会执行mergeData
        return mergeData(instanceData, defaultData)
      } else {
        // 子选项data没有值，直接返回默认data
        return defaultData
      }
    }
  }
}

strats.data = function (
  parentVal: any,
  childVal: any,
  vm?: Component
): ?Function {
  if (!vm) {
    if (childVal && typeof childVal !== 'function') {
      process.env.NODE_ENV !== 'production' && warn(
        'The "data" option should be a function ' +
        'that returns a per-instance value in component ' +
        'definitions.',
        vm
      )

      return parentVal
    }
    return mergeDataOrFn(parentVal, childVal)
  }

  return mergeDataOrFn(parentVal, childVal, vm)
}

/**
 * Hooks and props are merged as arrays.
 */
// 钩子函数当做数组合并来处理，最后返回数组
function mergeHook (
  parentVal: ?Array<Function>,
  childVal: ?Function | ?Array<Function>
): ?Array<Function> {
  const res = childVal
    ? parentVal // childVal有值
      ? parentVal.concat(childVal)   // parentVal有值，与childVal直接数组拼接
      : Array.isArray(childVal) // parentVal没有值，将childVal变成数组
        ? childVal
        : [childVal]
    : parentVal  // childVal没有值直接返回parentVal
  return res
    ? dedupeHooks(res)
    : res
}

// 去重操作
function dedupeHooks (hooks) {
  const res = []
  for (let i = 0; i < hooks.length; i++) {
    if (res.indexOf(hooks[i]) === -1) {
      res.push(hooks[i])
    }
  }
  return res
}

// src/shared/constants 文件定义
// LIFECYCLE_HOOKS = ['beforeCreate','created','beforeMount','mounted','beforeUpdate','updated','beforeDestroy','destroyed','activated','deactivated','errorCaptured','serverPrefetch']
// 所有钩子函数采用一种合并策略
LIFECYCLE_HOOKS.forEach(hook => {
  strats[hook] = mergeHook
})

/**
 * Assets
 *
 * When a vm is present (instance creation), we need to do
 * a three-way merge between constructor options, instance
 * options and parent options.
 */
function mergeAssets (
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): Object {
  // 创建一个空对象，通过res.__proto__可以访问到parentVal
  const res = Object.create(parentVal || null)
  // 如果childVal有值，则校验childVal[key]是否是对象，不是给出警告。
  // extend函数是将childVal的属性添加到res上
  if (childVal) {
    process.env.NODE_ENV !== 'production' && assertObjectType(key, childVal, vm)
    return extend(res, childVal)
  } else {
    return res
  }
}
// component、directive、filter
ASSET_TYPES.forEach(function (type) {
  strats[type + 's'] = mergeAssets
})

/**
 * Watchers.
 *
 * Watchers hashes should not overwrite one
 * another, so we merge them as arrays.
 */
strats.watch = function (
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): ?Object {
  // work around Firefox's Object.prototype.watch...
  // Firefox浏览器自带watch，如果是原生watch，则置空
  if (parentVal === nativeWatch) parentVal = undefined
  if (childVal === nativeWatch) childVal = undefined
  /* istanbul ignore if */
  // 如果没有childVal，则创建返回空对象，通过__proto__可以访问parentVal
  if (!childVal) return Object.create(parentVal || null)
   // 非正式环境检验校验childVal[key]是否是对象，不是给出警告。
  if (process.env.NODE_ENV !== 'production') {
    assertObjectType(key, childVal, vm)
  }
  // 如果没有parentVal，返回childVal
  if (!parentVal) return childVal
  // parentVal和childVal都有值的情况
  const ret = {}
  // 把parentVal属性添加到ret
  extend(ret, parentVal)
  // 遍历childVal
  for (const key in childVal) {
    let parent = ret[key]
    const child = childVal[key]
    // 如果parent存在，则变成数组
    if (parent && !Array.isArray(parent)) {
      parent = [parent]
    }
    // 返回数组
    ret[key] = parent
      ? parent.concat(child)
      : Array.isArray(child) ? child : [child]
  }
  return ret
}

/**
 * Other object hashes.
 */
strats.props =
strats.methods =
strats.inject =
strats.computed = function (
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): ?Object {
  // 非正式环境检验校验childVal[key]是否是对象，不是给出警告。
  if (childVal && process.env.NODE_ENV !== 'production') {
    assertObjectType(key, childVal, vm)
  }
  // 如果没有parentVal 返回childVal
  if (!parentVal) return childVal
  const ret = Object.create(null)
  // 将parentVal属性添加到ret
  extend(ret, parentVal)
  // 如果childVal有值，也将属性添加到ret
  if (childVal) extend(ret, childVal)
  return ret
}
strats.provide = mergeDataOrFn

/**
 * Default strategy.
 */
// 当子选项childVal存在时，就会采用子选项。也就是覆盖式的合并
const defaultStrat = function (parentVal: any, childVal: any): any {
  return childVal === undefined
    ? parentVal
    : childVal
}

/**
 * Validate component names 检查组件的名字是否符合规范
 */
function checkComponents (options: Object) {
  // 遍历对象的components属性，依次检验
  for (const key in options.components) {
    validateComponentName(key)
  }
}

// 以字母开头，任意单词字符结尾，[\w]　匹配任意单词字符
export function validateComponentName (name: string) {
  // 符合HTML5规范，由普通字符和中横线(-)组成，并且必须以字母开头。
  if (!new RegExp(`^[a-zA-Z][\\-\\.0-9_${unicodeRegExp.source}]*$`).test(name)) {
    warn(
      'Invalid component name: "' + name + '". Component names ' +
      'should conform to valid custom element name in html5 specification.'
    )
  }
  // isBuiltInTag是检验名字不能与slot、component重名
  // isReservedTag是检验不能与html、svg内置标签重名
  if (isBuiltInTag(name) || config.isReservedTag(name)) {
    warn(
      'Do not use built-in or reserved HTML elements as component ' +
      'id: ' + name
    )
  }
}

/**
 * Ensure all props option syntax are normalized into the
 * Object-based format.
 */
// 规范化props
function normalizeProps (options: Object, vm: ?Component) {
  // 定义props，是选项中的props属性的引用
  const props = options.props
  if (!props) return
  const res = {}
  let i, val, name
  // 1. 是数组的情况 例如：['name', 'age']
  if (Array.isArray(props)) {
    i = props.length
    // 循环遍历变成对象格式{ type: null }
    while (i--) {
      val = props[i]
      if (typeof val === 'string') {
        name = camelize(val) // 将key值变成驼峰形式
        res[name] = { type: null }
      } else if (process.env.NODE_ENV !== 'production') {
        // 如果不是字符串数组，非生产环境给出警告
        warn('props must be strings when using array syntax.')
      }
    }
  } else if (isPlainObject(props)) {  // 2. 是对象
    for (const key in props) {
      val = props[key]
      name = camelize(key)
      // 如果是对象，则直接赋值，不是的话，则赋值type属性
      // 例如 { sex: String, job: { type: String, default: 'xxx' } }
      res[name] = isPlainObject(val)
        ? val
        : { type: val }
    }
  } else if (process.env.NODE_ENV !== 'production') {
    // 不是数组和对象给出警告
    warn(
      `Invalid value for option "props": expected an Array or an Object, ` +
      `but got ${toRawType(props)}.`,
      vm
    )
  }
  // 规范后结果赋值给options.props
  options.props = res
}

/**
 * Normalize all injections into Object-based format
 */
// 规范化inject
function normalizeInject (options: Object, vm: ?Component) {
  // 取到options.inject的引用
  const inject = options.inject
  if (!inject) return
  // 重置对象，之后重新赋值属性
  const normalized = options.inject = {}
  // 1. 数组情况，直接遍历。与normalizeProps同理
  if (Array.isArray(inject)) {
    for (let i = 0; i < inject.length; i++) {
      normalized[inject[i]] = { from: inject[i] }
    }
  } else if (isPlainObject(inject)) {
    // 2. 对象情况。如果key值对应的是对象，则通过extend合并，如果不是，则代表直接是from
    for (const key in inject) {
      const val = inject[key]
      normalized[key] = isPlainObject(val)
        ? extend({ from: key }, val)
        : { from: val }
    }
  } else if (process.env.NODE_ENV !== 'production') {
    warn(
      `Invalid value for option "inject": expected an Array or an Object, ` +
      `but got ${toRawType(inject)}.`,
      vm
    )
  }
}

/**
 * Normalize raw function directives into object format.
 */
// 规范化directives
function normalizeDirectives (options: Object) {
  const dirs = options.directives
  // 遍历对象，如果key值对应的是函数。则修改成对象形式。
  // Vue提供了自定义指令的简写，如果只传函数，等同于{ bind: func, update: func
  if (dirs) {
    for (const key in dirs) {
      const def = dirs[key]
      if (typeof def === 'function') {
        dirs[key] = { bind: def, update: def }
      }
    }
  }
}

function assertObjectType (name: string, value: any, vm: ?Component) {
  if (!isPlainObject(value)) {
    warn(
      `Invalid value for option "${name}": expected an Object, ` +
      `but got ${toRawType(value)}.`,
      vm
    )
  }
}

/**
 * Merge two option objects into a new one.  合并两个option到一个新object里
 * Core utility used in both instantiation and inheritance. 用于实例化和继承的核心实用程序。
 */
// mergeOptions函数第三个参数的可选的，可以不传。Vue.mixin、Vue.extend函数中调用mergeOptions的时候是不传第三个参数的。选项的合并策略函数会根据vm参数来确定是实例化选项合并还是继承选项合并
// mergeOptions函数合并后会返回新的对象
export function mergeOptions (
  parent: Object,
  child: Object,
  vm?: Component
): Object {
  if (process.env.NODE_ENV !== 'production') {
    // 检查组件的名字是否符合规范
    checkComponents(child)
  }

  // child参数可以是普通选项对象，也可以是Vue构造函数和通过Vue.extend继承的子类构造函数
  if (typeof child === 'function') {
    child = child.options
  }

  // props、inject既可以是字符串数组，也可以是对象。directives既可以是一个函数，也可以是对象
  // 规范化选项，内部处理要把他们规范成一样
  normalizeProps(child, vm)
  normalizeInject(child, vm)
  normalizeDirectives(child)

  // Apply extends and mixins on the child options,
  // but only if it is a raw options object that isn't
  // the result of another mergeOptions call.
  // Only merged options has the _base property.
  // 判断没有_base属性的话(被合并过不再处理，只有合并过的选项会带有_base属性)
  if (!child._base) {
    // 如果有extends属性(`extends: xxx`)，则还是调用mergeOptions函数返回的结果赋值给parent
    if (child.extends) {
      parent = mergeOptions(parent, child.extends, vm)
    }
    // 如果有mixins属性(`mixins: [xxx, xxx]`)
    // 则遍历数组，递归调用mergeOptions，结果也赋值给parent
    if (child.mixins) {
      for (let i = 0, l = child.mixins.length; i < l; i++) {
        parent = mergeOptions(parent, child.mixins[i], vm)
      }
    }
  }

  // 定义options为空对象，最后函数返回结果是options
  const options = {}
  let key
  // 先遍历parent执行mergeField
  for (key in parent) {
    mergeField(key)
  }
  // 再遍历child，当parent没有key的时候，在执行mergeField。
  // 如果有key属性，就不需要合并啦，因为上一步已经合并到options上了
  for (key in child) {
    if (!hasOwn(parent, key)) {
      mergeField(key)
    }
  }
  // 该函数主要是通过key获取到对应的合并策略函数，然后执行合并，赋值给options[key]
  // 当strats[key]不存在时，会采取defaultStrat作为合并策略。也就是说如果我们不向Vue.config.optionMergeStrategies添加额外的策略，那就会采取默认的合并策略。
  function mergeField (key) {
    const strat = strats[key] || defaultStrat
    options[key] = strat(parent[key], child[key], vm, key)
  }
  return options
}

/**
 * Resolve an asset.
 * This function is used because child instances need access
 * to assets defined in its ancestor chain.
 */
 // 子实例需要访问在其祖先链中定义的资产
export function resolveAsset (
  options: Object,  // vm.$options
  type: string,     // driectives 或者其他
  id: string,       // 指令 name 或其他
  warnMissing?: boolean  // 是否显示警告信息
): any {
  // 如果 id 不为字符串，则直接跳过
  /* istanbul ignore if */
  if (typeof id !== 'string') {
    return
  }
  // 获取 options[type] 对象
  const assets = options[type]
  // 检查 assets 对象自身属性中是否具有指定 id 属性，有则直接返回
  // check local registration variations first
  if (hasOwn(assets, id)) return assets[id]
  const camelizedId = camelize(id)
  if (hasOwn(assets, camelizedId)) return assets[camelizedId]
  const PascalCaseId = capitalize(camelizedId)
  if (hasOwn(assets, PascalCaseId)) return assets[PascalCaseId]
  // fallback to prototype chain
  const res = assets[id] || assets[camelizedId] || assets[PascalCaseId]
  if (process.env.NODE_ENV !== 'production' && warnMissing && !res) {
    warn(
      'Failed to resolve ' + type.slice(0, -1) + ': ' + id,
      options
    )
  }
  return res
}
