/* @flow */

/**
 * createElement方法, 创建vnode
 */
import config from '../config'
import VNode, { createEmptyVNode } from './vnode'
import { createComponent } from './create-component'
import { traverse } from '../observer/traverse'

import {
  warn,
  isDef,
  isUndef,
  isTrue,
  isObject,
  isPrimitive,
  resolveAsset
} from '../util/index'

import {
  normalizeChildren,
  simpleNormalizeChildren
} from './helpers/index'

const SIMPLE_NORMALIZE = 1
const ALWAYS_NORMALIZE = 2

// 封装_createElement
// wrapper function for providing a more flexible interface
// without getting yelled at by flow
export function createElement(
  context: Component, // 执行上下文，vm 实例
  tag: any, // a 标签名
  data: any, // b data 键值对
  children: any, // c 子元素
  normalizationType: any, // d normalizationType 通常不传
  alwaysNormalize: boolean // 编译生成的render涵数为 false; 手写的render涵数为 true.
): VNode | Array < VNode > {
  // 参数见: https://cn.vuejs.org/v2/guide/render-function.html#createElement-参数
  // isPrimitive方法会判断data是否为 string||number||symbol||boolean
  // 这里 data 只能为 object , 若不是，则表示 data 未传，做参数重载， 因为data是可选参数，children则一定是一个数组
  // data 详细结构在 flow\vnode.js 里 declare interface VNodeData 有详细定义
  if (Array.isArray(data) || isPrimitive(data)) {
    normalizationType = children
    children = data
    data = undefined
  }
  // 最后一个参数传 true时，即我们手写render函数时，不接收 d 参数 normalizationType
  // normalizationType 会被直接附值 2
  if (isTrue(alwaysNormalize)) {
    normalizationType = ALWAYS_NORMALIZE
  }
  // 这里手写 render 时，normalizationType 为 2
  // 最终内部调用 _createElement 创建 vnode
  return _createElement(context, tag, data, children, normalizationType)
}

export function _createElement(
  context: Component,
  tag ? : string | Class < Component > | Function | Object,
  data ? : VNodeData,
  children ? : any,
  normalizationType ? : number
): VNode | Array < VNode > {
  // 对 data 进行校验，data不能为响应式的，
  // 在对obj进行响应式处理时，会在对象上加一个__ob__属性
  // 如果有__ob__属性则这个对象是响应式对象，是被监测(observed)数据
  if (isDef(data) && isDef((data: any).__ob__)) {
    process.env.NODE_ENV !== 'production' && warn(
      `Avoid using observed data object as vnode data: ${JSON.stringify(data)}\n` +
      'Always create fresh vnode data objects in each render!',
      context
    )
    return createEmptyVNode()
  }

  // data传入 {is: p}
  // 则tag名称优先取data传入的is  // components 里会存在 data.is 属性，用 data.is 替代 tag
  // object syntax in v-bind
  if (isDef(data) && isDef(data.is)) {
    tag = data.is
  }

  // 没有指定tag, 创建空vnode
  if (!tag) {
    // in case of component :is set to falsy value
    return createEmptyVNode()
  }

  // warn against non-primitive key
  // 对 data , 对 key 进行校验，类型不为 string||number||symbol||boolean 基础类型则报错
  if (process.env.NODE_ENV !== 'production' &&
    // isPrimitive 只能是基础类型 例如 string number symbol boolean
    isDef(data) && isDef(data.key) && !isPrimitive(data.key)
  ) {
    if (!__WEEX__ || !('@binding' in data.key)) {
      warn(
        'Avoid using non-primitive value as key, ' +
        'use string/number value instead.',
        context
      )
    }
  }

  // 特殊用法支持, children传入的数组元素是个函数
  // support single function children as default scoped slot
  if (Array.isArray(children) &&
    typeof children[0] === 'function'
  ) {
    data = data || {}
    data.scopedSlots = { default: children[0] }
    children.length = 0
  }
  // SIMPLE_NORMALIZE 1
  // ALWAYS_NORMALIZE 2
  // 根据render函数是编译生成还是用户手写，分别调用了 simpleNormalizeChildren 和 normalizeChildren
  if (normalizationType === ALWAYS_NORMALIZE) {
    // 手写走这里，会根据 render 函数，创建 vnodeText 节点
    children = normalizeChildren(children)
  } else if (normalizationType === SIMPLE_NORMALIZE) {
    // 编译走这里,这里只会把 children 拍平，变成一维数组
    children = simpleNormalizeChildren(children)
  }
  // 核心代码：根据标签名称tag做相应操作生成vnode
  let vnode, ns
  // 对 tag 进行判断，这里 tag 可以是一个字符串，也可以是一个组件
  // 字符串情况，div、span、组件tag；
  if (typeof tag === 'string') {
    let Ctor
    // getTagNamespace在platform中定义，tag名需要针对平台做不同处理
    ns = (context.$vnode && context.$vnode.ns) || config.getTagNamespace(tag)
    // isReservedTag也在platform中定义, 不同平台tag是不同的，检测tag是否是平台的保留的原生标签
    if (config.isReservedTag(tag)) {
      // 可见createElement本质就是创建一个VNode实例
      // platform built-in elements
      if (process.env.NODE_ENV !== 'production' && isDef(data) && isDef(data.nativeOn)) {
        warn(
          `The .native modifier for v-on is only valid on components but it was used on <${tag}>.`,
          context
        )
      }
      // 生成一个vnode标签
      // config.parsePlatformTagName(tag) 在浏览器端，直接就调用 identity 函数，直接返回传入的值
      vnode = new VNode(
        config.parsePlatformTagName(tag), data, children,
        undefined, undefined, context
      )
    } else if ((!data || !data.pre) && isDef(Ctor = resolveAsset(context.$options, 'components', tag))) {
      // resolveAsset 获取组件构造函数，context是组件实例，vm.$options.components.comp
      // component
      // 自定义组件，第一次调用createComponent是为了获取自定义组件虚拟dom，调用的是create-components.js
      vnode = createComponent(Ctor, data, context, children, tag)
    } else {
      // unknown or unlisted namespaced elements
      // check at runtime because it may get assigned a namespace when its
      // parent normalizes children
      vnode = new VNode(
        tag, data, children,
        undefined, undefined, context
      )
    }
  } else {
    // tag不是string, 那么tag就是一个构造函数, 因此是一个组件
    // direct component options / constructor
    vnode = createComponent(tag, data, context, children)
  }
  if (Array.isArray(vnode)) {
    return vnode
  } else if (isDef(vnode)) { // vnode没有创建，则返回空vnode
    if (isDef(ns)) applyNS(vnode, ns)
    if (isDef(data)) registerDeepBindings(data)
    return vnode
  } else {
    return createEmptyVNode()
  }
}

function applyNS(vnode, ns, force) {
  vnode.ns = ns
  if (vnode.tag === 'foreignObject') {
    // use default namespace inside foreignObject
    ns = undefined
    force = true
  }
  if (isDef(vnode.children)) {
    for (let i = 0, l = vnode.children.length; i < l; i++) {
      const child = vnode.children[i]
      if (isDef(child.tag) && (
          isUndef(child.ns) || (isTrue(force) && child.tag !== 'svg'))) {
        applyNS(child, ns, force)
      }
    }
  }
}

// ref #5318
// necessary to ensure parent re-render when deep bindings like :style and
// :class are used on slot nodes
function registerDeepBindings(data) {
  if (isObject(data.style)) {
    traverse(data.style)
  }
  if (isObject(data.class)) {
    traverse(data.class)
  }
}
