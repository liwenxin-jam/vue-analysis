/**
 * Virtual Dom 核心
 * 算法基于https://github.com/snabbdom/snabbdom修改
 */

/**
 * Virtual DOM patching algorithm based on Snabbdom by
 * Simon Friis Vindum (@paldepind)
 * Licensed under the MIT License
 * https://github.com/paldepind/snabbdom/blob/master/LICENSE
 *
 * modified by Evan You (@yyx990803)
 *
 * Not type-checking this because this file is perf-critical and the cost
 * of making flow understand it is not worth it.
 */

import VNode, { cloneVNode } from './vnode'
import config from '../config'
import { SSR_ATTR } from 'shared/constants'
import { registerRef } from './modules/ref'
import { traverse } from '../observer/traverse'
import { activeInstance } from '../instance/lifecycle'
import { isTextInputType } from 'web/util/element'

import {
  warn,
  isDef,
  isUndef,
  isTrue,
  makeMap,
  isRegExp,
  isPrimitive
} from '../util/index'

export const emptyNode = new VNode('', {}, [])

// 勾子类型数组
const hooks = ['create', 'activate', 'update', 'remove', 'destroy']

function sameVnode (a, b) {
  return (
    // 存在key值，且相等
    a.key === b.key && (
      (
        // 标签名相等
        a.tag === b.tag &&
        // 是否是注释节点
        a.isComment === b.isComment &&
        // 是否都定义了data，data包含一些具体信息，例如onclick style
        isDef(a.data) === isDef(b.data) &&
        // 当标签是<input>的时候，type必须相同
        sameInputType(a, b)
      ) || (
        isTrue(a.isAsyncPlaceholder) &&
        a.asyncFactory === b.asyncFactory &&
        isUndef(b.asyncFactory.error)
      )
    )
  )
}

function sameInputType (a, b) {
  if (a.tag !== 'input') return true
  let i
  const typeA = isDef(i = a.data) && isDef(i = i.attrs) && i.type
  const typeB = isDef(i = b.data) && isDef(i = i.attrs) && i.type
  return typeA === typeB || isTextInputType(typeA) && isTextInputType(typeB)
}

function createKeyToOldIdx (children, beginIdx, endIdx) {
  let i, key
  const map = {}
  for (i = beginIdx; i <= endIdx; ++i) {
    key = children[i].key
    if (isDef(key)) map[key] = i
  }
  return map
}

export function createPatchFunction (backend) {
  let i, j
  const cbs = {}

  // 解构赋值，接收传递进来的函数模块
  // 获取后端方法 nodeOps node节点操作方法集合
  // modules、nodeOps都返回数组
  // modules定义了  ref, directives, attrs, klass, events, domProps, style, transition 的更新操作工具方法
  // modules 结构为 [{create, update}, {create, update}, {create, update}, ……, {create, destroy, update}]
  // 把所有节点操作 都放在了数组里，对应 create 方法、 update 方法
  // nodeOps 结构为 {appendChild, createComment, createElement, createElementNS,
  // createTextNode, insertBefore, nextSibling, parentNode, removeChild, setStyleScope, setTextContent, tagName}
  const { modules, nodeOps } = backend

  // 冒泡遍历，初始化拿到所有的模块勾子
  // hooks = ['create', 'activate', 'update', 'remove', 'destroy']
  for (i = 0; i < hooks.length; ++i) {
    // cbs['create'] = []
    cbs[hooks[i]] = []
    for (j = 0; j < modules.length; ++j) {
      // 通过isDef方法判断modules是否定义了hooks里的钩子函数，有则push进 cbs[hooks[i]]
      if (isDef(modules[j][hooks[i]])) {
        // cbs['create'] = [attrFn, classFn]
        cbs[hooks[i]].push(modules[j][hooks[i]])
      }
    }
  }
  //处理后的 cbs 结构为 ['create' : […],   'activate' : […],   'update' : […],   'remove' : […],   'destroy' : […]]

  // 真实dom转化为虚拟dom
  // new 一个 vnode,只传了 tagName 和 真实DOM节点
  // emptyNodeAt 方法就是把真实 dom 转换为 vnode
  function emptyNodeAt (elm) {
    return new VNode(nodeOps.tagName(elm).toLowerCase(), {}, [], undefined, elm)
  }

  // 创建成功后回调删除节点
  function createRmCb (childElm, listeners) {
    function remove () {
      // listeners 只有一个删除
      if (--remove.listeners === 0) {
        // 移除这个子节点
        removeNode(childElm)
      }
    }
    // 在 函数 remove 上挂载了一个 listeners 属性，值为传进来的
    remove.listeners = listeners
    return remove
  }

  // 移除子节点
  function removeNode (el) {
    // 获取父节点
    const parent = nodeOps.parentNode(el)
    // element may have already been removed due to v-html / v-text
    // 元素可能已经因为v-html/v-text而被删除。
    if (isDef(parent)) {
      // 删除子节点
      nodeOps.removeChild(parent, el)
    }
  }

  // 未识别的 element 对象
  function isUnknownElement (vnode, inVPre) {
    return (
      !inVPre &&
      !vnode.ns &&
      !(
        config.ignoredElements.length &&
        config.ignoredElements.some(ignore => {
          return isRegExp(ignore)
            ? ignore.test(vnode.tag)
            : ignore === vnode.tag
        })
      ) &&
      config.isUnknownElement(vnode.tag)
    )
  }

  let creatingElmInVPre = 0

  // ***先看 createElm 方法，这个方法创建了真实 DOM 元素。
  function createElm (
    vnode,  // 需要创建真实 dom 的 vnode
    insertedVnodeQueue,  // insert 勾子用的东西
    parentElm,
    refElm,
    nested,
    ownerArray,
    index
  ) {
    if (isDef(vnode.elm) && isDef(ownerArray)) {
      // This vnode was used in a previous render!
      // now it's used as a new node, overwriting its elm would cause
      // potential patch errors down the road when it's used as an insertion
      // reference node. Instead, we clone the node on-demand before creating
      // associated DOM element for it.
      // 此vode用于以前的呈现！现在它被用作一个新的节点，覆盖它的ELM将导致潜在的补丁错误，
      // 当它被用作插入引用节点时。相反，在为节点创建相关DOM元素之前，我们先按需克隆节点。
      // cloneVNode 用于克隆当前 vnode 对象。
      vnode = ownerArray[index] = cloneVNode(vnode)
    }

    // 首次创建是一个 root 节点插入
    vnode.isRootInsert = !nested // for transition enter check
    // 组件创建
    // 在调用了组件初始化钩子之后，初始化组件，并且重新激活组件。在重新激活组件中使用 insert 方法操作 DOM
    if (createComponent(vnode, insertedVnodeQueue, parentElm, refElm)) {
      return
    }

    // 原生标签创建
    const data = vnode.data
    const children = vnode.children
    const tag = vnode.tag
    if (isDef(tag)) {
      // 开发环境这里会检测，组件未注册，会提示报错
      if (process.env.NODE_ENV !== 'production') {
        if (data && data.pre) {
          creatingElmInVPre++
        }
        // 组件有引入使用，但未全局/局部注册，抛出警告
        if (isUnknownElement(vnode, creatingElmInVPre)) {
          warn(
            'Unknown custom element: <' + tag + '> - did you ' +
            'register the component correctly? For recursive components, ' +
            'make sure to provide the "name" option.',
            vnode.context
          )
        }
      }

      // nodeOps.createElementNS 和 nodeOps.createElement 方法，其实是真实 DOM 的方法
      // 看是否是 ns 节点，如果是 createElementNS 不是 createElement
      // 创建好节点挂载到 vnode.elm 上
      vnode.elm = vnode.ns
        ? nodeOps.createElementNS(vnode.ns, tag)
        : nodeOps.createElement(tag, vnode) // 通过封装的document.createElement创建一个原生dom
      // setScope 用于为 scoped CSS 设置作用域 ID 属性
      setScope(vnode)

      /* istanbul ignore if */
      if (__WEEX__) {
        // in Weex, the default insertion order is parent-first.
        // List items can be optimized to use children-first insertion
        // with append="tree".
        const appendAsTree = isDef(data) && isTrue(data.appendAsTree)
        if (!appendAsTree) {
          if (isDef(data)) {
            invokeCreateHooks(vnode, insertedVnodeQueue)
          }
          insert(parentElm, vnode.elm, refElm)
        }
        // createChildren 用于创建子节点，如果子节点是数组，则遍历执行 createElm 方法，如果 child 中有组件，还走 createComponent 创建组件 vm 实例
        // 如果子节点的 text 属性有数据，则使用 nodeOps.appendChild(...) 在真实 DOM 中插入文本内容。
        createChildren(vnode, children, insertedVnodeQueue)
        if (appendAsTree) {
          if (isDef(data)) {
            invokeCreateHooks(vnode, insertedVnodeQueue)
          }
          insert(parentElm, vnode.elm, refElm)
        }
      } else {
        // 如果有vnode有子节点，先创建子节点，通过parentElm插入
        createChildren(vnode, children, insertedVnodeQueue)
        if (isDef(data)) {
          invokeCreateHooks(vnode, insertedVnodeQueue)
        }
        // insert 用于将元素插入真实 DOM 中。
        // parentElm    父级挂载节点
        // vnode.elm    当前 vnode 节点
        // refElm       参考节点
        insert(parentElm, vnode.elm, refElm)
      }

      if (process.env.NODE_ENV !== 'production' && data && data.pre) {
        creatingElmInVPre--
      }
    } else if (isTrue(vnode.isComment)) {
      vnode.elm = nodeOps.createComment(vnode.text)
      // 添加注释节点
      insert(parentElm, vnode.elm, refElm)
    } else {
      vnode.elm = nodeOps.createTextNode(vnode.text)
      // 添加文本节点
      insert(parentElm, vnode.elm, refElm)
    }
  }

  // 第二次调用createComponent，是把前面的create-element那个执行createComponent的结果vnode转换为真实dom
  function createComponent (vnode, insertedVnodeQueue, parentElm, refElm) {
    // 获取管理钩子函数，首先拿到data
    let i = vnode.dat
    // 判断 data 是否存在
    if (isDef(i)) {
      // keepAlive相关
      const isReactivated = isDef(vnode.componentInstance) && i.keepAlive
      // 存在init钩子，则执行创建实例并挂载
      if (isDef(i = i.hook) && isDef(i = i.init)) {
        i(vnode, false /* hydrating */)
      }
      // after calling the init hook, if the vnode is a child component
      // it should've created a child instance and mounted it. the child
      // component also has set the placeholder vnode's elm.
      // in that case we can just return the element and be done.
      // 判断组件实例存在
      if (isDef(vnode.componentInstance)) {
        // 属性初始化
        initComponent(vnode, insertedVnodeQueue)
        // dom插入操作
        insert(parentElm, vnode.elm, refElm)
        if (isTrue(isReactivated)) {
          reactivateComponent(vnode, insertedVnodeQueue, parentElm, refElm)
        }
        return true
      }
    }
  }

  function initComponent (vnode, insertedVnodeQueue) {
    if (isDef(vnode.data.pendingInsert)) {
      insertedVnodeQueue.push.apply(insertedVnodeQueue, vnode.data.pendingInsert)
      vnode.data.pendingInsert = null
    }
    // 将 vnode.componentInstance.$el 挂载到 vnode 上
    vnode.elm = vnode.componentInstance.$el
    if (isPatchable(vnode)) {
      invokeCreateHooks(vnode, insertedVnodeQueue)
      setScope(vnode)
    } else {
      // empty component root.
      // skip all element-related modules except for ref (#3455)
      registerRef(vnode)
      // make sure to invoke the insert hook
      insertedVnodeQueue.push(vnode)
    }
  }

  function reactivateComponent (vnode, insertedVnodeQueue, parentElm, refElm) {
    let i
    // hack for #4339: a reactivated component with inner transition
    // does not trigger because the inner node's created hooks are not called
    // again. It's not ideal to involve module-specific logic in here but
    // there doesn't seem to be a better way to do it.
    let innerNode = vnode
    while (innerNode.componentInstance) {
      innerNode = innerNode.componentInstance._vnode
      if (isDef(i = innerNode.data) && isDef(i = i.transition)) {
        for (i = 0; i < cbs.activate.length; ++i) {
          cbs.activate[i](emptyNode, innerNode)
        }
        insertedVnodeQueue.push(innerNode)
        break
      }
    }
    // unlike a newly created component,
    // a reactivated keep-alive component doesn't insert itself
    insert(parentElm, vnode.elm, refElm)
  }

  // 调用封装的原生domcument api进行插入
  // parent 父vnode, elm 当前待插入的vnode, ref 参考的vnode
  function insert (parent, elm, ref) {
    if (isDef(parent)) {
      if (isDef(ref)) {
        if (nodeOps.parentNode(ref) === parent) {
          nodeOps.insertBefore(parent, elm, ref)
        }
      } else {
        nodeOps.appendChild(parent, elm)
      }
    }
  }

  // 递归children，创建vnode
  function createChildren (vnode, children, insertedVnodeQueue) {
    // 判断child是否是一个数组
    if (Array.isArray(children)) {
      if (process.env.NODE_ENV !== 'production') {
        checkDuplicateKeys(children)
      }
      // 递归，直到找不到children
      for (let i = 0; i < children.length; ++i) {
        createElm(children[i], insertedVnodeQueue, vnode.elm, null, true, children, i)
      }
    } else if (isPrimitive(vnode.text)) { // 如果是一个基础的文本dom，直接插入
      nodeOps.appendChild(vnode.elm, nodeOps.createTextNode(String(vnode.text)))
    }
  }

  function isPatchable (vnode) {
    while (vnode.componentInstance) {
      vnode = vnode.componentInstance._vnode
    }
    return isDef(vnode.tag)
  }

  function invokeCreateHooks (vnode, insertedVnodeQueue) {
    for (let i = 0; i < cbs.create.length; ++i) {
      cbs.create[i](emptyNode, vnode)
    }
    i = vnode.data.hook // Reuse variable
    if (isDef(i)) {
      if (isDef(i.create)) i.create(emptyNode, vnode)
      if (isDef(i.insert)) insertedVnodeQueue.push(vnode)
    }
  }

  // set scope id attribute for scoped CSS.
  // this is implemented as a special case to avoid the overhead
  // of going through the normal attribute patching process.
  function setScope (vnode) {
    let i
    // vnode.fnScopeId 方法作用域 id
    if (isDef(i = vnode.fnScopeId)) {
      nodeOps.setStyleScope(vnode.elm, i)
    } else {
      let ancestor = vnode
      while (ancestor) {
        if (isDef(i = ancestor.context) && isDef(i = i.$options._scopeId)) {
          nodeOps.setStyleScope(vnode.elm, i)
        }
        ancestor = ancestor.parent
      }
    }
    // for slot content they should also get the scopeId from the host instance.
    if (isDef(i = activeInstance) &&
      i !== vnode.context &&
      i !== vnode.fnContext &&
      isDef(i = i.$options._scopeId)
    ) {
      nodeOps.setStyleScope(vnode.elm, i)
    }
  }

  function addVnodes (parentElm, refElm, vnodes, startIdx, endIdx, insertedVnodeQueue) {
    for (; startIdx <= endIdx; ++startIdx) {
      createElm(vnodes[startIdx], insertedVnodeQueue, parentElm, refElm, false, vnodes, startIdx)
    }
  }

  // 销毁节点钩子
  function invokeDestroyHook (vnode) {
    let i, j
    const data = vnode.data
    if (isDef(data)) {
      // data.hook.destroy 存在，则调用下 data上销毁钩子
      if (isDef(i = data.hook) && isDef(i = i.destroy)) i(vnode)
      // 徇环把所有 destroy 钩子调用一遍
      for (i = 0; i < cbs.destroy.length; ++i) cbs.destroy[i](vnode)
    }
    // vnode 如果存在 children
    if (isDef(i = vnode.children)) {
      // 徇环 children 节点，递归调用 invokeDestroyHook 函数销毁节点
      for (j = 0; j < vnode.children.length; ++j) {
        invokeDestroyHook(vnode.children[j])
      }
    }
  }

  function removeVnodes (vnodes, startIdx, endIdx) {
    for (; startIdx <= endIdx; ++startIdx) {
      const ch = vnodes[startIdx]
      if (isDef(ch)) {
        if (isDef(ch.tag)) {
          removeAndInvokeRemoveHook(ch)
          invokeDestroyHook(ch)
        } else { // Text node
          removeNode(ch.elm)
        }
      }
    }
  }

  function removeAndInvokeRemoveHook (vnode, rm) {
    if (isDef(rm) || isDef(vnode.data)) {
      let i
      const listeners = cbs.remove.length + 1
      if (isDef(rm)) {
        // we have a recursively passed down rm callback
        // increase the listeners count
        rm.listeners += listeners
      } else {
        // directly removing
        rm = createRmCb(vnode.elm, listeners)
      }
      // recursively invoke hooks on child component root node
      if (isDef(i = vnode.componentInstance) && isDef(i = i._vnode) && isDef(i.data)) {
        removeAndInvokeRemoveHook(i, rm)
      }
      for (i = 0; i < cbs.remove.length; ++i) {
        cbs.remove[i](vnode, rm)
      }
      if (isDef(i = vnode.data.hook) && isDef(i = i.remove)) {
        i(vnode, rm)
      } else {
        rm()
      }
    } else {
      removeNode(vnode.elm)
    }
  }

  // 重排算法，主要作用是用一种较高效的方式比对新旧两个VNode的children得出最小操作补丁。
  // 在新老两组VNode节点的左右头尾两侧都有一个变量标记，在遍历过程中这几个变量都会向中间靠拢。 当oldStartIdx > oldEndIdx或者newStartIdx > newEndIdx时结束循环
  // 其中 oldCh 和 newCh 即表示了新旧 vnode 数组，两组数组通过比对的方式来差异化更新 DOM。
  function updateChildren (parentElm, oldCh, newCh, insertedVnodeQueue, removeOnly) {
    // 老vnode. 开始索引值、结束索引值、开始vnode、结束vnode
    let oldStartIdx = 0
    let oldEndIdx = oldCh.length - 1
    let oldStartVnode = oldCh[0]
    let oldEndVnode = oldCh[oldEndIdx]
    // 新vnode. 开始索引值、结束索引值、开始vnode、结束vnode
    let newStartIdx = 0
    let newEndIdx = newCh.length - 1
    let newStartVnode = newCh[0]
    let newEndVnode = newCh[newEndIdx]

    let oldKeyToIdx, idxInOld, vnodeToMove, refElm

    // removeOnly is a special flag used only by <transition-group>
    // to ensure removed elements stay in correct relative positions
    // during leaving transitions
    // removeOnly 是一个只用于 <transition-group> 的特殊标签，
    // 确保移除元素过程中保持一个正确的相对位置。
    const canMove = !removeOnly

    if (process.env.NODE_ENV !== 'production') {
      checkDuplicateKeys(newCh)
    }

    // 进行循环遍历，遍历条件为 oldStartIdx <= oldEndIdx 和 newStartIdx <= newEndIdx 开始索引不能大于结束索引
    // 在遍历过程中，oldStartIdx 和 newStartIdx 递增，oldEndIdx 和 newEndIdx 递减。当条件不符合跳出遍历循环
    // 如果 oldStartVnode 和 newStartVnode 相似，执行 patch
    while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
      // 头尾指针调整
      if (isUndef(oldStartVnode)) {
        // oldStartVnode 未定义， 将 oldStartVnode 设置为下一个子节点
        oldStartVnode = oldCh[++oldStartIdx] // Vnode has been moved left
      } else if (isUndef(oldEndVnode)) {
        // oldEndVnode 未定义， 将 oldEndVnode 设置为上一个子节点
        oldEndVnode = oldCh[--oldEndIdx]
      } else if (sameVnode(oldStartVnode, newStartVnode)) {
        // 【 oldStartVnode 】 【 newStartVnode 】
        // 如果oldStartVnode和newStartVnode是同一节点，调用patchVnode进行patch，
        // 然后将oldStartVnode和newStartVnode都设置为下一个子节点，重复上述流程
        patchVnode(oldStartVnode, newStartVnode, insertedVnodeQueue, newCh, newStartIdx)
        oldStartVnode = oldCh[++oldStartIdx]
        newStartVnode = newCh[++newStartIdx]
      } else if (sameVnode(oldEndVnode, newEndVnode)) {
        // 【 oldEndVnode 】 【 newEndVnode 】，两个开头相同
        // 如果oldEndVnode和newEndVnode是同一节点，调用patchVnode进行patch
        // 然后将oldEndVnode和newEndVnode都设置为上一个子节点，重复上述流程
        patchVnode(oldEndVnode, newEndVnode, insertedVnodeQueue, newCh, newEndIdx)
        // 索引向后移动一位
        oldEndVnode = oldCh[--oldEndIdx]
        newEndVnode = newCh[--newEndIdx]
      } else if (sameVnode(oldStartVnode, newEndVnode)) { // Vnode moved right
        // 【 oldStartVnode 】 【 newEndVnode 】，老的开始跟新的结束相同，除了打补丁之外还要移动到队尾
        // 如果oldStartVnode和newEndVnode是同一节点，调用patchVnode进行patch，
        patchVnode(oldStartVnode, newEndVnode, insertedVnodeQueue, newCh, newEndIdx)
        // 如果removeOnly是false，那么可以把oldStartVnode.elm移动到oldEndVnode.elm之后，
        // parentElm 父节点，oldStartVnode.elm 移动的节点，nodeOps.nextSibling(oldEndVnode.elm) 参考的节点
        canMove && nodeOps.insertBefore(parentElm, oldStartVnode.elm, nodeOps.nextSibling(oldEndVnode.elm))
        // 然后把oldStartVnode设置为下一个节点，newEndVnode设置为上一个节点，重复上述流程
        oldStartVnode = oldCh[++oldStartIdx]
        newEndVnode = newCh[--newEndIdx]
      } else if (sameVnode(oldEndVnode, newStartVnode)) { // Vnode moved left
        // 【 oldEndVnode 】 【 newStartVnode 】
        // 如果newStartVnode和oldEndVnode是同一节点，调用patchVnode进行patch
        patchVnode(oldEndVnode, newStartVnode, insertedVnodeQueue, newCh, newStartIdx)
        // 如果removeOnly是false，那么可以把oldEndVnode.elm移动到oldStartVnode.elm之前
        canMove && nodeOps.insertBefore(parentElm, oldEndVnode.elm, oldStartVnode.elm)
        // 然后把newStartVnode设置为下一个节点，oldEndVnode设置为上一个节点，重复上述流程
        oldEndVnode = oldCh[--oldEndIdx]
        newStartVnode = newCh[++newStartIdx]
      } else {
        // 如果以上4种头尾比较都不匹配，就尝试双循环查找，在oldChildren中寻找跟newStartVnode具有相同key的节点，如果找不到相同key的节点
        // 说明newStartVnode是一个新节点，就创建一个，然后把newStartVnode设置为下一个节点
        // 获取老 vnode 的 oldChildren 数组的 key 的集合。
        // createKeyToOldIdx 返回结构为 createKeyToOldIdx[key] = oldChildren_index;
        if (isUndef(oldKeyToIdx)) oldKeyToIdx = createKeyToOldIdx(oldCh, oldStartIdx, oldEndIdx)
        // 如果新 newStartVnode.key 存在，找到对应老 vnode 对应的 index.
        idxInOld = isDef(newStartVnode.key)
          ? oldKeyToIdx[newStartVnode.key]
          : findIdxInOld(newStartVnode, oldCh, oldStartIdx, oldEndIdx)
        if (isUndef(idxInOld)) { // New element
          // 没有找到，说明没有这个元素，创建新 DOM 元素。
          createElm(newStartVnode, insertedVnodeQueue, parentElm, oldStartVnode.elm, false, newCh, newStartIdx)
        } else {
          // 找到了对应的老 vnode, 即 oldCh[idxInOld]
          vnodeToMove = oldCh[idxInOld]
          if (sameVnode(vnodeToMove, newStartVnode)) {
            // 如果生成的 vnode 和新开始 vnode 相似，执行 patch。
            patchVnode(vnodeToMove, newStartVnode, insertedVnodeQueue, newCh, newStartIdx)
            // 赋值 undefined，插入 vnodeToMove 元素
            oldCh[idxInOld] = undefined
            // 如果 removeOnly 是 false，那么可以把 vnodeToMove.elm移动到 oldStartVnode.elm 之前
            canMove && nodeOps.insertBefore(parentElm, vnodeToMove.elm, oldStartVnode.elm)
          } else {
            // vnodeToMove 与 newStartVnode 不是同一vnode, 即为相同的 key 不同的元素，视为新元素
            // same key but different element. treat as new element
            createElm(newStartVnode, insertedVnodeQueue, parentElm, oldStartVnode.elm, false, newCh, newStartIdx)
          }
        }
        // 新开始 vnode 向右一位
        newStartVnode = newCh[++newStartIdx]
      }
    }
    // 新老数组存在剩下的元素未处理的情况
    // 如果老开始 idx 大于老结束 idx，如果是有效数据则添加 vnode 到新 vnode 中。
    if (oldStartIdx > oldEndIdx) {
      refElm = isUndef(newCh[newEndIdx + 1]) ? null : newCh[newEndIdx + 1].elm
      // 批量新增 vnode
      addVnodes(parentElm, refElm, newCh, newStartIdx, newEndIdx, insertedVnodeQueue)
    } else if (newStartIdx > newEndIdx) {
      // 批量删除 vnode
      removeVnodes(oldCh, oldStartIdx, oldEndIdx)
    }
  }

  function checkDuplicateKeys (children) {
    const seenKeys = {}
    for (let i = 0; i < children.length; i++) {
      const vnode = children[i]
      const key = vnode.key
      if (isDef(key)) {
        if (seenKeys[key]) {
          warn(
            `Duplicate keys detected: '${key}'. This may cause an update error.`,
            vnode.context
          )
        } else {
          seenKeys[key] = true
        }
      }
    }
  }

  function findIdxInOld (node, oldCh, start, end) {
    for (let i = start; i < end; i++) {
      const c = oldCh[i]
      if (isDef(c) && sameVnode(node, c)) return i
    }
  }

  // diff算法，比对并局部更新 DOM 以达到性能优化的目的
  // 比较两个虚拟dom，包括三种类型操作：属性更新、文本更新、子节点更新
  // 具体规则如下:
  // 1. 新老节点均有children子节点，则对子节点进行diff操作，调用updateChildren
  // 2. 如果老节点没有子节点而新节点有子节点，先清空老节点的文本内容，然后为其新增子节点。
  // 3. 当新节点没有子节点而老节点有子节点的时候，则移除该节点的所有子节点。
  // 4. 当新老节点都无子节点的时候，只是文本的替换。
  function patchVnode (
    oldVnode,
    vnode,
    insertedVnodeQueue,
    ownerArray,
    index,
    removeOnly
  ) {
    // 新旧 vnode 相等，则什么都不做
    if (oldVnode === vnode) {
      return
    }

    if (isDef(vnode.elm) && isDef(ownerArray)) {
      // clone reused vnode
      vnode = ownerArray[index] = cloneVNode(vnode)
    }

    const elm = vnode.elm = oldVnode.elm

    // 如果是异步占位，执行 hydrate 方法或者定义 isAsyncPlaceholder 为 true，然后退出。
    if (isTrue(oldVnode.isAsyncPlaceholder)) {
      if (isDef(vnode.asyncFactory.resolved)) {
        hydrate(oldVnode.elm, vnode, insertedVnodeQueue)
      } else {
        vnode.isAsyncPlaceholder = true
      }
      return
    }

    // reuse element for static trees.
    // note we only do this if the vnode is cloned -
    // if the new node is not cloned it means the render functions have been
    // reset by the hot-reload-api and we need to do a proper re-render.
    // 静态节点判断
    // 如果新旧vnode为静态节点和新旧vnode key相同，且新 vnode 是克隆所得；新 vnode 有 v-once 的属性
    // 则新 vnode 的 componentInstance 用老的 vnode 的。即 vnode 的 componentInstance 保持不变。
    // 如果两个vnode都为静态，不用更新，所以将以前的 componentInstance 实例传给当前 vnode，并退出
    if (isTrue(vnode.isStatic) &&
      isTrue(oldVnode.isStatic) &&
      vnode.key === oldVnode.key &&
      (isTrue(vnode.isCloned) || isTrue(vnode.isOnce))
    ) {
      vnode.componentInstance = oldVnode.componentInstance
      return
    }

    let i
    const data = vnode.data
    // 执行组件的钩子，例如打补丁patch后的 data.hook.prepatch
    if (isDef(data) && isDef(i = data.hook) && isDef(i = i.prepatch)) {
      i(oldVnode, vnode)
    }

    // 查找新旧节点是否存在孩子
    const oldCh = oldVnode.children
    const ch = vnode.children
    // 元素节点属性更新
    if (isDef(data) && isPatchable(vnode)) {
      // cbs中关于属性更新的数组拿出来[attrFn, classFn, ...]，遍历调用 update 回调，在watcher里并执行 update 钩子
      for (i = 0; i < cbs.update.length; ++i) cbs.update[i](oldVnode, vnode)
      // 执行 data.hook.update 钩子
      if (isDef(i = data.hook) && isDef(i = i.update)) i(oldVnode, vnode)
    }
    // 判断是否是元素，旧vnode的text是否为undefined
    if (isUndef(vnode.text)) {
      // 新旧 vnode 都有 children
      if (isDef(oldCh) && isDef(ch)) {
        // 递归比较，比孩子，reorder重排
        // vnode 没有 text、两个 vnode 不相等，执行 updateChildren 方法。这是虚拟 DOM 的关键。
        if (oldCh !== ch) updateChildren(elm, oldCh, ch, insertedVnodeQueue, removeOnly)
      } else if (isDef(ch)) {
        // 新节点有孩子
        if (process.env.NODE_ENV !== 'production') {
          checkDuplicateKeys(ch)
        }
        // 如果新 vnode 有 children，而老的没有，清空文本，并添加 vnode 节点。
        if (isDef(oldVnode.text)) nodeOps.setTextContent(elm, '')
        // 创建 vnode 孩子，并追加
        addVnodes(elm, null, ch, 0, ch.length - 1, insertedVnodeQueue)
      } else if (isDef(oldCh)) {
        // 如果老 vnode 有 children，而新的没有，删除 vnode 节点即可
        removeVnodes(oldCh, 0, oldCh.length - 1)
      } else if (isDef(oldVnode.text)) {
        // 如果两个 vnode 都没有 children，老 vnode 有 text ，新 vnode 没有 text ，则清空 DOM 文本内容
        nodeOps.setTextContent(elm, '')
      }
    } else if (oldVnode.text !== vnode.text) {
      // 如果老 vnode 和新 vnode都是文本节点，只是text不同，更新 DOM 元素文本内容。
      nodeOps.setTextContent(elm, vnode.text)
    }
    if (isDef(data)) {
      // 执行 data.hook.postpatch 钩子，表明 patch 完毕
      if (isDef(i = data.hook) && isDef(i = i.postpatch)) i(oldVnode, vnode)
    }
  }

  function invokeInsertHook (vnode, queue, initial) {
    // delay insert hooks for component root nodes, invoke them after the
    // element is really inserted
    if (isTrue(initial) && isDef(vnode.parent)) {
      vnode.parent.data.pendingInsert = queue
    } else {
      for (let i = 0; i < queue.length; ++i) {
        queue[i].data.hook.insert(queue[i])
      }
    }
  }

  let hydrationBailed = false
  // list of modules that can skip create hook during hydration because they
  // are already rendered on the client or has no need for initialization
  // Note: style is excluded because it relies on initial clone for future
  // deep updates (#7063).
  const isRenderedModule = makeMap('attrs,class,staticClass,staticStyle,key')

  // Note: this is a browser-only function so we can assume elms are DOM nodes.
  function hydrate (elm, vnode, insertedVnodeQueue, inVPre) {
    let i
    const { tag, data, children } = vnode
    inVPre = inVPre || (data && data.pre)
    vnode.elm = elm

    if (isTrue(vnode.isComment) && isDef(vnode.asyncFactory)) {
      vnode.isAsyncPlaceholder = true
      return true
    }
    // assert node match
    if (process.env.NODE_ENV !== 'production') {
      if (!assertNodeMatch(elm, vnode, inVPre)) {
        return false
      }
    }
    if (isDef(data)) {
      if (isDef(i = data.hook) && isDef(i = i.init)) i(vnode, true /* hydrating */)
      if (isDef(i = vnode.componentInstance)) {
        // child component. it should have hydrated its own tree.
        initComponent(vnode, insertedVnodeQueue)
        return true
      }
    }
    if (isDef(tag)) {
      if (isDef(children)) {
        // empty element, allow client to pick up and populate children
        if (!elm.hasChildNodes()) {
          createChildren(vnode, children, insertedVnodeQueue)
        } else {
          // v-html and domProps: innerHTML
          if (isDef(i = data) && isDef(i = i.domProps) && isDef(i = i.innerHTML)) {
            if (i !== elm.innerHTML) {
              /* istanbul ignore if */
              if (process.env.NODE_ENV !== 'production' &&
                typeof console !== 'undefined' &&
                !hydrationBailed
              ) {
                hydrationBailed = true
                console.warn('Parent: ', elm)
                console.warn('server innerHTML: ', i)
                console.warn('client innerHTML: ', elm.innerHTML)
              }
              return false
            }
          } else {
            // iterate and compare children lists
            let childrenMatch = true
            let childNode = elm.firstChild
            for (let i = 0; i < children.length; i++) {
              if (!childNode || !hydrate(childNode, children[i], insertedVnodeQueue, inVPre)) {
                childrenMatch = false
                break
              }
              childNode = childNode.nextSibling
            }
            // if childNode is not null, it means the actual childNodes list is
            // longer than the virtual children list.
            if (!childrenMatch || childNode) {
              /* istanbul ignore if */
              if (process.env.NODE_ENV !== 'production' &&
                typeof console !== 'undefined' &&
                !hydrationBailed
              ) {
                hydrationBailed = true
                console.warn('Parent: ', elm)
                console.warn('Mismatching childNodes vs. VNodes: ', elm.childNodes, children)
              }
              return false
            }
          }
        }
      }
      if (isDef(data)) {
        let fullInvoke = false
        for (const key in data) {
          if (!isRenderedModule(key)) {
            fullInvoke = true
            invokeCreateHooks(vnode, insertedVnodeQueue)
            break
          }
        }
        if (!fullInvoke && data['class']) {
          // ensure collecting deps for deep class bindings for future updates
          traverse(data['class'])
        }
      }
    } else if (elm.data !== vnode.text) {
      elm.data = vnode.text
    }
    return true
  }

  function assertNodeMatch (node, vnode, inVPre) {
    if (isDef(vnode.tag)) {
      return vnode.tag.indexOf('vue-component') === 0 || (
        !isUnknownElement(vnode, inVPre) &&
        vnode.tag.toLowerCase() === (node.tagName && node.tagName.toLowerCase())
      )
    } else {
      return node.nodeType === (vnode.isComment ? 8 : 3)
    }
  }

  // 外部调用createPatchFunction实际调用的就是当前返回出去的patch函数
  // 代码中的关键在于 【 createElm 】 和 【 patchVnode 】 方法
  // createElm 方法，这个方法创建了真实 DOM 元素。
  // patchVnode 方法，这个方法是为了比对并局部更新 DOM 以达到性能优化的目的
  // 为什么返回patch，主要是为了实现跨平台
  return function patch (oldVnode, vnode, hydrating, removeOnly) {
    // 1.如果 vnode 不存在但是 oldVnode 存在，说明意图是要销毁老节点，那么就调用 invokeDestroyHook(oldVnode) 来进行销毁
    if (isUndef(vnode)) {
      if (isDef(oldVnode)) invokeDestroyHook(oldVnode)
      return
    }

    // 首次渲染
    let isInitialPatch = false
    // insert 勾子用的东西
    const insertedVnodeQueue = []

    // 2.如果oldVnode不存在但是vnode存在，说明意图是要创建新节点，那么就调用createElm来创建新节点
    if (isUndef(oldVnode)) {
      // empty mount (likely as component), create new root element
      // 老的 VNode 未定义，初始化。
      // 这里是首次渲染
      isInitialPatch = true
      // 这里创建DOM节点，把需要插入的放入insertedVnodeQueue
      createElm(vnode, insertedVnodeQueue)
    } else {
      // DOM 的 nodeType http://www.w3school.com.cn/jsref/prop_node_nodetype.asp
      const isRealElement = isDef(oldVnode.nodeType)
      // 是不是一个真实dom，如果传入的是真实节点，则是初始化操作
      // 不是真实dom，说明是更新操作，patchVnode对比虚拟dom，diff算法打补丁
      if (!isRealElement && sameVnode(oldVnode, vnode)) {
        // patch existing root node
        // 3.当前 VNode 和老 VNode 都存在时，执行更新操作，根据diff算法
        // 如果oldVnode和vnode是同一个节点，就调用patchVnode来进行patch
        // 比较两个vnode，包括三种类型操作：属性更新、文本更新、子节点更新，具体规则如下：
        // 1. 新老节点均有children子节点，则对子节点进行diff操作，调用updateChildren
        // 2. 如果老节点没有子节点而新节点有子节点，先清空老节点的文本内容，然后为其新增子节点。
        // 3. 当新节点没有子节点而老节点有子节点的时候，则移除该节点的所有子节点。
        // 4. 当新老节点都无子节点的时候，只是文本的替换。
        patchVnode(oldVnode, vnode, insertedVnodeQueue, null, null, removeOnly)
      } else {
        // 第一次渲染组件走这里，初始化过程
        // 如果oldVnode是真实dom节点
        if (isRealElement) {
          // mounting to a real element
          // check if this is server-rendered content and if we can perform
          // a successful hydration.
          // 是不是服务端ssr渲染
          // 挂载一个真实元素，确认是否为服务器渲染环境或者是否可以执行成功的合并到真实 DOM 中
          if (oldVnode.nodeType === 1 && oldVnode.hasAttribute(SSR_ATTR)) {
            oldVnode.removeAttribute(SSR_ATTR)
            hydrating = true
          }
          if (isTrue(hydrating)) {
            // 需要用 hydrate 函数将虚拟dom和真是dom进行映射，然后将oldVnode设置为对应的虚拟dom，
            // 找到oldVnode.elm的父节点，根据vnode创建一个真实dom节点并插入到该父节点中oldVnode.elm的位置
            if (hydrate(oldVnode, vnode, insertedVnodeQueue)) {
              // 调用 insert 钩子
              // inserted：被绑定元素插入父节点时调用
              invokeInsertHook(vnode, insertedVnodeQueue, true)
              return oldVnode
            } else if (process.env.NODE_ENV !== 'production') {
              warn(
                'The client-side rendered virtual DOM tree is not matching ' +
                'server-rendered content. This is likely caused by incorrect ' +
                'HTML markup, for example nesting block-level elements inside ' +
                '<p>, or missing <tbody>. Bailing hydration and performing ' +
                'full client-side render.'
              )
            }
          }
          // either not server-rendered, or hydration failed.
          // create an empty node and replace it
          // 真实dom转化为vnode
          // 不是服务器渲染或者合并到真实 DOM 失败，创建一个空节点替换原有节点
          oldVnode = emptyNodeAt(oldVnode)
        }

        // replacing existing element
        // 替换已有元素
        const oldElm = oldVnode.elm
        const parentElm = nodeOps.parentNode(oldElm)

        // create new node
        // 将vnode挂载到真实dom上
        createElm(
          vnode,
          insertedVnodeQueue,
          // extremely rare edge case: do not insert if old element is in a
          // leaving transition. Only happens when combining transition +
          // keep-alive + HOCs. (#4590)
          oldElm._leaveCb ? null : parentElm,
          nodeOps.nextSibling(oldElm)
        )

        // update parent placeholder node element, recursively
        // 递归更新父级占位节点元素，
        if (isDef(vnode.parent)) {
          let ancestor = vnode.parent
          const patchable = isPatchable(vnode)
          while (ancestor) {
            for (let i = 0; i < cbs.destroy.length; ++i) {
              cbs.destroy[i](ancestor)
            }
            ancestor.elm = vnode.elm
            if (patchable) {
              for (let i = 0; i < cbs.create.length; ++i) {
                cbs.create[i](emptyNode, ancestor)
              }
              // #6513
              // invoke insert hooks that may have been merged by create hooks.
              // e.g. for directives that uses the "inserted" hook.
              const insert = ancestor.data.hook.insert
              if (insert.merged) {
                // start at index 1 to avoid re-invoking component mounted hook
                for (let i = 1; i < insert.fns.length; i++) {
                  insert.fns[i]()
                }
              }
            } else {
              registerRef(ancestor)
            }
            ancestor = ancestor.parent
          }
        }
        // destroy old node
        // 销毁旧节点
        if (isDef(parentElm)) {
          // 渲染完vnode，需要删除原生真实的父dom
          removeVnodes([oldVnode], 0, 0)
        } else if (isDef(oldVnode.tag)) {
          invokeDestroyHook(oldVnode)
        }
      }
    }

    // 调用 insert 钩子
    invokeInsertHook(vnode, insertedVnodeQueue, isInitialPatch)
    return vnode.elm
  }
}
