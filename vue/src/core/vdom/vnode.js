/* @flow */

/**
 * vnode虚拟dom的类定义
 * VNode实例本质也只是一个简单对象
 * 以及导出vnode相关几个操作方法:
 */
export default class VNode {
  tag: string | void;
  data: VNodeData | void;
  children: ?Array<VNode>;
  text: string | void;
  elm: Node | void;
  ns: string | void;
  context: Component | void; // rendered in this component's scope
  key: string | number | void;
  componentOptions: VNodeComponentOptions | void;
  componentInstance: Component | void; // component instance
  parent: VNode | void; // component placeholder node

  // strictly internal
  raw: boolean; // contains raw HTML? (server only)
  isStatic: boolean; // hoisted static node
  isRootInsert: boolean; // necessary for enter transition check
  isComment: boolean; // empty comment placeholder?
  isCloned: boolean; // is a cloned node?
  isOnce: boolean; // is a v-once node?
  asyncFactory: Function | void; // async component factory function
  asyncMeta: Object | void;
  isAsyncPlaceholder: boolean;
  ssrContext: Object | void;
  fnContext: Component | void; // real context vm for functional nodes
  fnOptions: ?ComponentOptions; // for SSR caching
  devtoolsMeta: ?Object; // used to store functional render context for devtools
  fnScopeId: ?string; // functional scope id support

  constructor (
    tag?: string,
    data?: VNodeData,
    children?: ?Array<VNode>,
    text?: string,
    elm?: Node,
    context?: Component,
    componentOptions?: VNodeComponentOptions,
    asyncFactory?: Function
  ) {
    // vnode的tag名称
    this.tag = tag                // 当前节点标签名，DOM 中的文本内容被当做了一个只有 text 没有 tag 的节点。
    // vnode的相关属性,参见: https://cn.vuejs.org/v2/guide/render-function.html#深入data-object参数
    this.data = data              // 当前节点数据（ VNodeData 类型） 像 class、id 等 HTML 属性都放在了 data 中
    // vnode的子节点树， array结构
    // 参见: https://cn.vuejs.org/v2/guide/render-function.html#createElement-参数
    this.children = children      // 当前节点子节点
    // vnode的文本
    this.text = text              // 当前节点文本
    this.elm = elm                // 当前节点对应的真实DOM节点，elm 属性则指向了其相对应的真实 DOM 节点。
    this.ns = undefined           // 当前节点命名空间
    this.context = context        // 当前节点上下文   所有对象的 context 选项都指向了 Vue 实例
    this.fnContext = undefined    // 函数化组件上下文
    this.fnOptions = undefined    // 函数化组件配置项
    this.fnScopeId = undefined    // 函数化组件ScopeId // 方法作用域id
    this.key = data && data.key   // 子节点key属性
    this.componentOptions = componentOptions  // 组件配置项
    this.componentInstance = undefined  // 组件实例
    this.parent = undefined             // 当前节点父节点
    this.raw = false                    // 是否为原生HTML或只是普通文本
    this.isStatic = false               // 静态节点标志 keep-alive
    this.isRootInsert = true            // 是否作为根节点插入
    // 是否是空vnode的标记
    this.isComment = false              // 是否为注释节点
    // 是否是通过clone VNode而来
    this.isCloned = false               // 是否为克隆节点
    this.isOnce = false                 // 是否为v-once节点
    this.asyncFactory = asyncFactory    // 异步工厂方法
    this.asyncMeta = undefined          // 异步Meta
    this.isAsyncPlaceholder = false     // 是否为异步占位
  }

  // DEPRECATED: alias for componentInstance for backwards compat.
  // 容器实例向后兼容的别名
  // 获取组件实例
  /* istanbul ignore next */
  get child (): Component | void {
    return this.componentInstance
  }
}

// 创建空的vnode, 实际上是注释节点
export const createEmptyVNode = (text: string = '') => {
  const node = new VNode()
  node.text = text
  node.isComment = true
  return node
}

// 创建文本vnode, 文本vnode没有tag
export function createTextVNode (val: string | number) {
  return new VNode(undefined, undefined, undefined, String(val))
}

// clone一个vnode实例
// optimized shallow clone
// used for static nodes and slot nodes because they may be reused across
// multiple renders, cloning them avoids errors when DOM manipulations rely
// on their elm reference.
export function cloneVNode (vnode: VNode): VNode {
  const cloned = new VNode(
    vnode.tag,
    vnode.data,
    // #7975
    // clone children array to avoid mutating original in case of cloning
    // a child.
    vnode.children && vnode.children.slice(),
    vnode.text,
    vnode.elm,
    vnode.context,
    vnode.componentOptions,
    vnode.asyncFactory
  )
  // 同步不能通过构造函数创建实例而建立的属性
  cloned.ns = vnode.ns
  cloned.isStatic = vnode.isStatic
  cloned.key = vnode.key
  cloned.isComment = vnode.isComment
  cloned.fnContext = vnode.fnContext
  cloned.fnOptions = vnode.fnOptions
  cloned.fnScopeId = vnode.fnScopeId
  cloned.asyncMeta = vnode.asyncMeta
  // 通过cloneVNode创建的vnode设置标记位
  cloned.isCloned = true
  return cloned
}
