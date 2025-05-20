/**
 * Flowy.js - 用于创建和管理流程图的JavaScript库
 * @param {HTMLElement} canvas - 流程图的容器元素
 * @param {Function} grab - 当块被抓取时的回调函数
 * @param {Function} release - 当块被释放时的回调函数
 * @param {Function} snapping - 判断是否可以将块连接到另一个块的函数
 * @param {Function} rearrange - 当块被重新排列时的回调函数
 * @param {number} spacing_x - 块之间的水平间距
 * @param {number} spacing_y - 块之间的垂直间距
 */
var flowy = function(canvas, grab, release, snapping, rearrange, spacing_x, spacing_y) {
    // 设置默认的抓取回调函数
    if (!grab) {
        grab = function() {};
    }
    // 设置默认的释放回调函数
    if (!release) {
        release = function() {};
    }
    // 设置默认的连接判断函数，默认总是允许连接
    if (!snapping) {
        snapping = function() {
            return true;
        }
    }
    // 设置默认的重新排列回调函数，默认不允许重新排列
    if (!rearrange) {
        rearrange = function() {
            return false;
        }
    }
    // 设置默认的水平间距
    if (!spacing_x) {
        spacing_x = 20;
    }
    // 设置默认的垂直间距
    if (!spacing_y) {
        spacing_y = 80;
    }
    // 为不支持matches方法的浏览器添加polyfill
    if (!Element.prototype.matches) {
        Element.prototype.matches = Element.prototype.msMatchesSelector ||
            Element.prototype.webkitMatchesSelector;
    }
    // 为不支持closest方法的浏览器添加polyfill
    if (!Element.prototype.closest) {
        Element.prototype.closest = function(s) {
            var el = this;
            do {
                if (Element.prototype.matches.call(el, s)) return el;
                el = el.parentElement || el.parentNode;
            } while (el !== null && el.nodeType === 1);
            return null;
        };
    }
    // 标记是否已加载
    var loaded = false;
    
    /**
     * 初始化Flowy库
     */
    flowy.load = function() {
        // 防止重复加载
        if (!loaded)
            loaded = true;
        else
            return;
            
        // 存储所有块的数组
        var blocks = [];
        // 临时存储块的数组（用于重新排列）
        var blockstemp = [];
        // 画布元素
        var canvas_div = canvas;
        // 画布的绝对位置
        var absx = 0;
        var absy = 0;
        
        // 如果画布是绝对定位或固定定位，获取其绝对位置
        if (window.getComputedStyle(canvas_div).position == "absolute" || window.getComputedStyle(canvas_div).position == "fixed") {
            absx = canvas_div.getBoundingClientRect().left;
            absy = canvas_div.getBoundingClientRect().top;
        }
        
        // 是否有活动的拖拽
        var active = false;
        // 水平和垂直间距
        var paddingx = spacing_x;
        var paddingy = spacing_y;
        // 左侧偏移量
        var offsetleft = 0;
        // 是否正在重新排列
        var rearrange = false;
        // 拖拽相关变量
        var drag, dragx, dragy, original;
        // 鼠标位置
        var mouse_x, mouse_y;
        // 是否正在拖拽块
        var dragblock = false;
        // 前一个块的ID
        var prevblock = 0;
        // 创建指示器元素，用于显示可放置位置
        var el = document.createElement("DIV");
        el.classList.add('indicator');
        el.classList.add('invisible');
        canvas_div.appendChild(el);
        /**
         * 导入流程图数据
         * @param {Object} output - 包含流程图数据的对象
         */
        flowy.import = function(output) {
            // 设置画布的HTML内容
            canvas_div.innerHTML = output.html;
            
            // 遍历所有块并添加到blocks数组
            for (var a = 0; a < output.blockarr.length; a++) {
                blocks.push({
                    childwidth: parseFloat(output.blockarr[a].childwidth),
                    parent: parseFloat(output.blockarr[a].parent),
                    id: parseFloat(output.blockarr[a].id),
                    x: parseFloat(output.blockarr[a].x),
                    y: parseFloat(output.blockarr[a].y),
                    width: parseFloat(output.blockarr[a].width),
                    height: parseFloat(output.blockarr[a].height)
                })
            }
            
            // 如果有多个块，重新排列并检查偏移
            if (blocks.length > 1) {
                rearrangeMe();
                checkOffset();
            }
        }
        /**
         * 导出流程图数据
         * @returns {Object} 包含流程图完整数据的对象
         */
        flowy.output = function() {
            // 获取画布的HTML内容
            var html_ser = canvas_div.innerHTML;
            
            // 初始化返回的JSON数据对象
            var json_data = {
                html: html_ser,      // HTML内容
                blockarr: blocks,    // 块数组
                blocks: []           // 块详细数据
            };
            
            // 如果有块，收集每个块的详细数据
            if (blocks.length > 0) {
                for (var i = 0; i < blocks.length; i++) {
                    // 添加块的基本信息
                    json_data.blocks.push({
                        id: blocks[i].id,
                        parent: blocks[i].parent,
                        data: [],     // 存储块内的表单数据
                        attr: []      // 存储块的属性
                    });
                    
                    // 获取块的DOM元素
                    var blockParent = document.querySelector(".blockid[value='" + blocks[i].id + "']").parentNode;
                    
                    // 收集块内的所有表单输入元素
                    blockParent.querySelectorAll("input").forEach(function(block) {
                        var json_name = block.getAttribute("name");
                        var json_value = block.value;
                        json_data.blocks[i].data.push({
                            name: json_name,
                            value: json_value
                        });
                    });
                    
                    // 收集块元素的所有属性
                    Array.prototype.slice.call(blockParent.attributes).forEach(function(attribute) {
                        var jsonobj = {};
                        jsonobj[attribute.name] = attribute.value;
                        json_data.blocks[i].attr.push(jsonobj);
                    });
                }
                return json_data;
            }
        }
        /**
         * 删除所有块并重置画布
         */
        flowy.deleteBlocks = function() {
            // 清空块数组
            blocks = [];
            // 重置画布内容，只保留指示器
            canvas_div.innerHTML = "<div class='indicator invisible'></div>";
        }

        /**
         * 开始拖拽操作
         * @param {Event} event - 鼠标或触摸事件
         */
        flowy.beginDrag = function(event) {
            // 更新画布的绝对位置
            if (window.getComputedStyle(canvas_div).position == "absolute" || window.getComputedStyle(canvas_div).position == "fixed") {
                absx = canvas_div.getBoundingClientRect().left;
                absy = canvas_div.getBoundingClientRect().top;
            }
            
            // 获取鼠标或触摸点的位置
            if (event.targetTouches) {
                mouse_x = event.changedTouches[0].clientX;
                mouse_y = event.changedTouches[0].clientY;
            } else {
                mouse_x = event.clientX;
                mouse_y = event.clientY;
            }
            
            // 如果不是右键点击且目标是可创建流程图元素
            if (event.which != 3 && event.target.closest(".create-flowy")) {
                // 保存原始元素
                original = event.target.closest(".create-flowy");
                // 克隆节点创建新元素
                var newNode = event.target.closest(".create-flowy").cloneNode(true);
                // 添加正在拖拽的样式
                event.target.closest(".create-flowy").classList.add("dragnow");
                // 将新节点转换为块
                newNode.classList.add("block");
                newNode.classList.remove("create-flowy");
                
                // 如果是第一个块
                if (blocks.length === 0) {
                    newNode.innerHTML += "<input type='hidden' name='blockid' class='blockid' value='" + blocks.length + "'>";
                    document.body.appendChild(newNode);
                    drag = document.querySelector(".blockid[value='" + blocks.length + "']").parentNode;
                } else {
                    // 如果不是第一个块，生成新的ID
                    newNode.innerHTML += "<input type='hidden' name='blockid' class='blockid' value='" + (Math.max.apply(Math, blocks.map(a => a.id)) + 1) + "'>";
                    document.body.appendChild(newNode);
                    drag = document.querySelector(".blockid[value='" + (parseInt(Math.max.apply(Math, blocks.map(a => a.id))) + 1) + "']").parentNode;
                }
                
                // 调用块被抓取的回调
                blockGrabbed(event.target.closest(".create-flowy"));
                // 添加拖拽样式
                drag.classList.add("dragging");
                // 激活拖拽状态
                active = true;
                // 计算鼠标与元素左上角的偏移量
                dragx = mouse_x - (event.target.closest(".create-flowy").getBoundingClientRect().left);
                dragy = mouse_y - (event.target.closest(".create-flowy").getBoundingClientRect().top);
                // 设置拖拽元素的初始位置
                drag.style.left = mouse_x - dragx + "px";
                drag.style.top = mouse_y - dragy + "px";
            }
        }

        /**
         * 结束拖拽操作
         * @param {Event} event - 鼠标或触摸事件
         */
        flowy.endDrag = function(event) {
            // 如果不是右键点击且处于拖拽或重排状态
            if (event.which != 3 && (active || rearrange)) {
                // 重置拖拽块状态
                dragblock = false;
                // 调用块释放的回调
                blockReleased();
                // 隐藏指示器
                if (!document.querySelector(".indicator").classList.contains("invisible")) {
                    document.querySelector(".indicator").classList.add("invisible");
                }
                // 如果处于活动拖拽状态，移除相关样式
                if (active) {
                    original.classList.remove("dragnow");
                    drag.classList.remove("dragging");
                }
                
                // 如果是重排第一个块
                if (parseInt(drag.querySelector(".blockid").value) === 0 && rearrange) {
                    firstBlock("rearrange")    
                } 
                // 如果是首次添加块并且在画布区域内
                else if (active && blocks.length == 0 && (drag.getBoundingClientRect().top + window.scrollY) > (canvas_div.getBoundingClientRect().top + window.scrollY) && (drag.getBoundingClientRect().left + window.scrollX) > (canvas_div.getBoundingClientRect().left + window.scrollX)) {
                    firstBlock("drop");
                } 
                // 如果是首次添加块但不在画布区域内
                else if (active && blocks.length == 0) {
                    removeSelection();
                } 
                // 如果是在活动拖拽状态且画布中已有其他块
                else if (active) {
                    var blocko = blocks.map(a => a.id);
                    // 检查是否可以连接到现有块
                    for (var i = 0; i < blocks.length; i++) {
                        if (checkAttach(blocko[i])) {
                            active = false;
                            // 如果可以连接，调用连接函数
                            if (blockSnap(drag, false, document.querySelector(".blockid[value='" + blocko[i] + "']").parentNode)) {
                                snap(drag, i, blocko);
                            } else {
                                active = false;
                                removeSelection();
                            }
                            break;
                        } else if (i == blocks.length - 1) {
                            // 如果没有可连接的块，移除选择
                            active = false;
                            removeSelection();
                        }
                    }
                } 
                // 如果处于重排状态
                else if (rearrange) {
                    var blocko = blocks.map(a => a.id);
                    // 检查是否可以连接到现有块
                    for (var i = 0; i < blocks.length; i++) {
                        if (checkAttach(blocko[i])) {
                            active = false;
                            drag.classList.remove("dragging");
                            snap(drag, i, blocko);
                            break;
                        } else if (i == blocks.length - 1) {
                            if (beforeDelete(drag, blocks.filter(id => id.id == blocko[i])[0])) {
                                active = false;
                                drag.classList.remove("dragging");
                                snap(drag, blocko.indexOf(prevblock), blocko);
                                break;
                            } else {
                                rearrange = false;
                                blockstemp = [];
                                active = false;
                                removeSelection();
                                break;
                            }
                        }
                    }
                }
            }
        }
        
        /**
         * 检查当前拖拽的块是否可以连接到指定的块
         * @param {number} id - 要检查的块的ID
         * @returns {boolean} 是否可以连接
         */
        function checkAttach(id) {
            // 计算当前拖拽块的中心水平位置
            const xpos = (drag.getBoundingClientRect().left + window.scrollX) + (parseInt(window.getComputedStyle(drag).width) / 2) + canvas_div.scrollLeft - canvas_div.getBoundingClientRect().left;
            // 计算当前拖拽块的垂直位置
            const ypos = (drag.getBoundingClientRect().top + window.scrollY) + canvas_div.scrollTop - canvas_div.getBoundingClientRect().top;
            
            // 检查当前拖拽块是否在目标块的可连接区域内
            if (xpos >= blocks.filter(a => a.id == id)[0].x - (blocks.filter(a => a.id == id)[0].width / 2) - paddingx && 
                xpos <= blocks.filter(a => a.id == id)[0].x + (blocks.filter(a => a.id == id)[0].width / 2) + paddingx && 
                ypos >= blocks.filter(a => a.id == id)[0].y - (blocks.filter(a => a.id == id)[0].height / 2) && 
                ypos <= blocks.filter(a => a.id == id)[0].y + blocks.filter(a => a.id == id)[0].height) {
                return true;   
            } else {
                return false;
            }
        }
        
        /**
         * 移除当前选中的块
         */
        function removeSelection() {
            // 将指示器移回画布
            canvas_div.appendChild(document.querySelector(".indicator"));
            // 删除拖拽的元素
            drag.parentNode.removeChild(drag);
        }
        
        /**
         * 处理第一个块的放置或重排
         * @param {string} type - 操作类型，"drop"或"rearrange"
         */
        function firstBlock(type) {
            // 如果是放置新块
            if (type == "drop") {
                // 检查块是否可以放置
                blockSnap(drag, true, undefined);
                // 重置活动状态
                active = false;
                // 调整块的位置
                drag.style.top = (drag.getBoundingClientRect().top + window.scrollY) - (absy + window.scrollY) + canvas_div.scrollTop + "px";
                drag.style.left = (drag.getBoundingClientRect().left + window.scrollX) - (absx + window.scrollX) + canvas_div.scrollLeft + "px";
                // 将块添加到画布
                canvas_div.appendChild(drag);
                // 将块添加到块数组
                blocks.push({
                    parent: -1,                // 没有父块，值为-1
                    childwidth: 0,             // 初始子块宽度为0
                    id: parseInt(drag.querySelector(".blockid").value),  // 块ID
                    // 计算块的中心位置
                    x: (drag.getBoundingClientRect().left + window.scrollX) + (parseInt(window.getComputedStyle(drag).width) / 2) + canvas_div.scrollLeft - canvas_div.getBoundingClientRect().left,
                    y: (drag.getBoundingClientRect().top + window.scrollY) + (parseInt(window.getComputedStyle(drag).height) / 2) + canvas_div.scrollTop - canvas_div.getBoundingClientRect().top,
                    // 记录块的尺寸
                    width: parseInt(window.getComputedStyle(drag).width),
                    height: parseInt(window.getComputedStyle(drag).height)
                });
            } 
            // 如果是重新排列
            else if (type == "rearrange") {
                // 移除拖拽样式
                drag.classList.remove("dragging");
                // 重置重排状态
                rearrange = false;
                
                // 处理所有临时块
                for (var w = 0; w < blockstemp.length; w++) {
                    // 如果不是当前拖拽的块
                    if (blockstemp[w].id != parseInt(drag.querySelector(".blockid").value)) {
                        const blockParent = document.querySelector(".blockid[value='" + blockstemp[w].id + "']").parentNode;
                        const arrowParent = document.querySelector(".arrowid[value='" + blockstemp[w].id + "']").parentNode;
                        
                        // 调整块和箭头的位置
                        blockParent.style.left = (blockParent.getBoundingClientRect().left + window.scrollX) - (window.scrollX) + canvas_div.scrollLeft - 1 - absx + "px";
                        blockParent.style.top = (blockParent.getBoundingClientRect().top + window.scrollY) - (window.scrollY) + canvas_div.scrollTop - absy - 1 + "px";
                        arrowParent.style.left = (arrowParent.getBoundingClientRect().left + window.scrollX) - (window.scrollX) + canvas_div.scrollLeft - absx - 1 + "px";
                        arrowParent.style.top = (arrowParent.getBoundingClientRect().top + window.scrollY) + canvas_div.scrollTop - 1 - absy + "px";
                        
                        // 将块和箭头添加到画布
                        canvas_div.appendChild(blockParent);
                        canvas_div.appendChild(arrowParent);
                        
                        // 更新块的位置信息
                        blockstemp[w].x = (blockParent.getBoundingClientRect().left + window.scrollX) + (parseInt(blockParent.offsetWidth) / 2) + canvas_div.scrollLeft - canvas_div.getBoundingClientRect().left - 1;
                        blockstemp[w].y = (blockParent.getBoundingClientRect().top + window.scrollY) + (parseInt(blockParent.offsetHeight) / 2) + canvas_div.scrollTop - canvas_div.getBoundingClientRect().top - 1;
                    }
                }
                
                // 更新第一个块的位置
                blockstemp.filter(a => a.id == 0)[0].x = (drag.getBoundingClientRect().left + window.scrollX) + (parseInt(window.getComputedStyle(drag).width) / 2) + canvas_div.scrollLeft - canvas_div.getBoundingClientRect().left;
                blockstemp.filter(a => a.id == 0)[0].y = (drag.getBoundingClientRect().top + window.scrollY) + (parseInt(window.getComputedStyle(drag).height) / 2) + canvas_div.scrollTop - canvas_div.getBoundingClientRect().top;
                
                // 将临时块数组合并到主块数组
                blocks = blocks.concat(blockstemp);
                // 清空临时块数组
                blockstemp = [];
            }
        }
        
        /**
         * 绘制连接块之间的箭头
         * @param {Object} arrow - 箭头对应的块
         * @param {number} x - 箭头的水平位置
         * @param {number} y - 箭头的垂直位置
         * @param {number} id - 父块的ID
         */
        function drawArrow(arrow, x, y, id) {
            // 根据位置关系绘制不同类型的箭头
            if (x < 0) {
                // 如果子块在父块左侧，绘制向左的箭头
                canvas_div.innerHTML += '<div class="arrowblock"><input type="hidden" class="arrowid" value="' + drag.querySelector(".blockid").value + '"><svg preserveaspectratio="none" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M' + (blocks.filter(a => a.id == id)[0].x - arrow.x + 5) + ' 0L' + (blocks.filter(a => a.id == id)[0].x - arrow.x + 5) + ' ' + (paddingy / 2) + 'L5 ' + (paddingy / 2) + 'L5 ' + y + '" stroke="#C5CCD0" stroke-width="2px"/><path d="M0 ' + (y - 5) + 'H10L5 ' + y + 'L0 ' + (y - 5) + 'Z" fill="#C5CCD0"/></svg></div>';
                document.querySelector('.arrowid[value="' + drag.querySelector(".blockid").value + '"]').parentNode.style.left = (arrow.x - 5) - (absx + window.scrollX) + canvas_div.scrollLeft + canvas_div.getBoundingClientRect().left + "px";
            } else {
                // 如果子块在父块右侧，绘制向右的箭头
                canvas_div.innerHTML += '<div class="arrowblock"><input type="hidden" class="arrowid" value="' + drag.querySelector(".blockid").value + '"><svg preserveaspectratio="none" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 0L20 ' + (paddingy / 2) + 'L' + (x) + ' ' + (paddingy / 2) + 'L' + x + ' ' + y + '" stroke="#C5CCD0" stroke-width="2px"/><path d="M' + (x - 5) + ' ' + (y - 5) + 'H' + (x + 5) + 'L' + x + ' ' + y + 'L' + (x - 5) + ' ' + (y - 5) + 'Z" fill="#C5CCD0"/></svg></div>';
                document.querySelector('.arrowid[value="' + parseInt(drag.querySelector(".blockid").value) + '"]').parentNode.style.left = blocks.filter(a => a.id == id)[0].x - 20 - (absx + window.scrollX) + canvas_div.scrollLeft + canvas_div.getBoundingClientRect().left + "px";
            }
            
            // 设置箭头的垂直位置
            document.querySelector('.arrowid[value="' + parseInt(drag.querySelector(".blockid").value) + '"]').parentNode.style.top = blocks.filter(a => a.id == id)[0].y + (blocks.filter(a => a.id == id)[0].height / 2) + canvas_div.getBoundingClientRect().top - absy + "px";
        }
        
        /**
         * 更新块之间的连接箭头
         * @param {Object} arrow - 箭头对应的块
         * @param {number} x - 箭头的水平位置
         * @param {number} y - 箭头的垂直位置
         * @param {Object} children - 子块对象
         */
        function updateArrow(arrow, x, y, children) { 
            // 根据位置关系更新不同类型的箭头
            if (x < 0) {
                // 如果子块在父块左侧，更新向左的箭头
                document.querySelector('.arrowid[value="' + children.id + '"]').parentNode.style.left = (arrow.x - 5) - (absx + window.scrollX) + canvas_div.getBoundingClientRect().left + "px";
                document.querySelector('.arrowid[value="' + children.id + '"]').parentNode.innerHTML = '<input type="hidden" class="arrowid" value="' + children.id + '"><svg preserveaspectratio="none" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M' + (blocks.filter(id => id.id == children.parent)[0].x - arrow.x + 5) + ' 0L' + (blocks.filter(id => id.id == children.parent)[0].x - arrow.x + 5) + ' ' + (paddingy / 2) + 'L5 ' + (paddingy / 2) + 'L5 ' + y + '" stroke="#C5CCD0" stroke-width="2px"/><path d="M0 ' + (y - 5) + 'H10L5 ' + y + 'L0 ' + (y - 5) + 'Z" fill="#C5CCD0"/></svg>';
            } else {
                // 如果子块在父块右侧，更新向右的箭头
                document.querySelector('.arrowid[value="' + children.id + '"]').parentNode.style.left = blocks.filter(id => id.id == children.parent)[0].x - 20 - (absx + window.scrollX) + canvas_div.getBoundingClientRect().left + "px";
                document.querySelector('.arrowid[value="' + children.id + '"]').parentNode.innerHTML = '<input type="hidden" class="arrowid" value="' + children.id + '"><svg preserveaspectratio="none" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 0L20 ' + (paddingy / 2) + 'L' + (x) + ' ' + (paddingy / 2) + 'L' + x + ' ' + y + '" stroke="#C5CCD0" stroke-width="2px"/><path d="M' + (x - 5) + ' ' + (y - 5) + 'H' + (x + 5) + 'L' + x + ' ' + y + 'L' + (x - 5) + ' ' + (y - 5) + 'Z" fill="#C5CCD0"/></svg>';
            }
        }

        /**
         * 将拖拽的块连接到目标块并调整其位置
         * @param {Element} drag - 被拖拽的块元素
         * @param {number} i - 目标块在blocko数组中的索引
         * @param {Array} blocko - 块ID数组
         */
        function snap(drag, i, blocko) {
            // 如果不是重排状态，将块添加到画布
            if (!rearrange) {
                canvas_div.appendChild(drag);
            }
            
            // 计算总宽度和偏移量
            var totalwidth = 0;
            var totalremove = 0;
            
            // 第一次遍历：计算所有子块的总宽度
            for (var w = 0; w < blocks.filter(id => id.parent == blocko[i]).length; w++) {
                var children = blocks.filter(id => id.parent == blocko[i])[w];
                // 如果子块的子宽度大于自身宽度，使用子宽度
                if (children.childwidth > children.width) {
                    totalwidth += children.childwidth + paddingx;
                } else {
                    totalwidth += children.width + paddingx;
                }
            }
            // 添加当前拖拽块的宽度
            totalwidth += parseInt(window.getComputedStyle(drag).width);
            
            // 第二次遍历：调整所有子块的位置
            for (var w = 0; w < blocks.filter(id => id.parent == blocko[i]).length; w++) {
                var children = blocks.filter(id => id.parent == blocko[i])[w];
                if (children.childwidth > children.width) {
                    // 如果子块的子宽度大于自身宽度，调整位置以保持居中
                    document.querySelector(".blockid[value='" + children.id + "']").parentNode.style.left = blocks.filter(a => a.id == blocko[i])[0].x - (totalwidth / 2) + totalremove + (children.childwidth / 2) - (children.width / 2) + "px";
                    children.x = blocks.filter(id => id.parent == blocko[i])[0].x - (totalwidth / 2) + totalremove + (children.childwidth / 2);
                    totalremove += children.childwidth + paddingx;
                } else {
                    // 否则使用块自身的宽度
                    document.querySelector(".blockid[value='" + children.id + "']").parentNode.style.left = blocks.filter(a => a.id == blocko[i])[0].x - (totalwidth / 2) + totalremove + "px";
                    children.x = blocks.filter(id => id.parent == blocko[i])[0].x - (totalwidth / 2) + totalremove + (children.width / 2);
                    totalremove += children.width + paddingx;
                }
            }
            
            // 设置当前拖拽块的位置
            drag.style.left = blocks.filter(id => id.id == blocko[i])[0].x - (totalwidth / 2) + totalremove - (window.scrollX + absx) + canvas_div.scrollLeft + canvas_div.getBoundingClientRect().left + "px";
            drag.style.top = blocks.filter(id => id.id == blocko[i])[0].y + (blocks.filter(id => id.id == blocko[i])[0].height / 2) + paddingy - (window.scrollY + absy) + canvas_div.getBoundingClientRect().top + "px";
            
            // 如果是重排状态
            if (rearrange) {
                // 更新拖拽块的位置信息
                blockstemp.filter(a => a.id == parseInt(drag.querySelector(".blockid").value))[0].x = (drag.getBoundingClientRect().left + window.scrollX) + (parseInt(window.getComputedStyle(drag).width) / 2) + canvas_div.scrollLeft - canvas_div.getBoundingClientRect().left;
                blockstemp.filter(a => a.id == parseInt(drag.querySelector(".blockid").value))[0].y = (drag.getBoundingClientRect().top + window.scrollY) + (parseInt(window.getComputedStyle(drag).height) / 2) + canvas_div.scrollTop - canvas_div.getBoundingClientRect().top;
                blockstemp.filter(a => a.id == drag.querySelector(".blockid").value)[0].parent = blocko[i];
                
                // 处理临时块数组中的其他块
                for (var w = 0; w < blockstemp.length; w++) {
                    if (blockstemp[w].id != parseInt(drag.querySelector(".blockid").value)) {
                        const blockParent = document.querySelector(".blockid[value='" + blockstemp[w].id + "']").parentNode;
                        const arrowParent = document.querySelector(".arrowid[value='" + blockstemp[w].id + "']").parentNode;
                        
                        // 调整其他块和箭头的位置
                        blockParent.style.left = (blockParent.getBoundingClientRect().left + window.scrollX) - (window.scrollX + canvas_div.getBoundingClientRect().left) + canvas_div.scrollLeft + "px";
                        blockParent.style.top = (blockParent.getBoundingClientRect().top + window.scrollY) - (window.scrollY + canvas_div.getBoundingClientRect().top) + canvas_div.scrollTop + "px";
                        arrowParent.style.left = (arrowParent.getBoundingClientRect().left + window.scrollX) - (window.scrollX + canvas_div.getBoundingClientRect().left) + canvas_div.scrollLeft + 20 + "px";
                        arrowParent.style.top = (arrowParent.getBoundingClientRect().top + window.scrollY) - (window.scrollY + canvas_div.getBoundingClientRect().top) + canvas_div.scrollTop + "px";
                        
                        // 将块和箭头添加到画布
                        canvas_div.appendChild(blockParent);
                        canvas_div.appendChild(arrowParent);

                        // 更新块的位置信息
                        blockstemp[w].x = (blockParent.getBoundingClientRect().left + window.scrollX) + (parseInt(window.getComputedStyle(blockParent).width) / 2) + canvas_div.scrollLeft - canvas_div.getBoundingClientRect().left;
                        blockstemp[w].y = (blockParent.getBoundingClientRect().top + window.scrollY) + (parseInt(window.getComputedStyle(blockParent).height) / 2) + canvas_div.scrollTop - canvas_div.getBoundingClientRect().top;
                    }
                }
                
                // 将临时块数组合并到主块数组
                blocks = blocks.concat(blockstemp);
                // 清空临时块数组
                blockstemp = [];
            } else {
                // 如果不是重排状态，将新块添加到块数组
                blocks.push({
                    childwidth: 0,                // 初始子块宽度为0
                    parent: blocko[i],            // 设置父块ID
                    id: parseInt(drag.querySelector(".blockid").value),  // 块ID
                    // 计算块的中心位置
                    x: (drag.getBoundingClientRect().left + window.scrollX) + (parseInt(window.getComputedStyle(drag).width) / 2) + canvas_div.scrollLeft - canvas_div.getBoundingClientRect().left,
                    y: (drag.getBoundingClientRect().top + window.scrollY) + (parseInt(window.getComputedStyle(drag).height) / 2) + canvas_div.scrollTop - canvas_div.getBoundingClientRect().top,
                    // 记录块的尺寸
                    width: parseInt(window.getComputedStyle(drag).width),
                    height: parseInt(window.getComputedStyle(drag).height)
                });
            }
            
            // 绘制当前块与父块之间的连接箭头
            var arrowblock = blocks.filter(a => a.id == parseInt(drag.querySelector(".blockid").value))[0];
            var arrowx = arrowblock.x - blocks.filter(a => a.id == blocko[i])[0].x + 20;
            var arrowy = paddingy;
            drawArrow(arrowblock, arrowx, arrowy, blocko[i]);
            
            // 更新父块及其祖先块的子宽度
            if (blocks.filter(a => a.id == blocko[i])[0].parent != -1) {
                var flag = false;
                var idval = blocko[i];
                
                // 递归向上更新所有祖先块的子宽度
                while (!flag) {
                    // 如果到达根块，结束循环
                    if (blocks.filter(a => a.id == idval)[0].parent == -1) {
                        flag = true;
                    } else {
                        // 计算当前块的所有子块的总宽度
                        var zwidth = 0;
                        for (var w = 0; w < blocks.filter(id => id.parent == idval).length; w++) {
                            var children = blocks.filter(id => id.parent == idval)[w];
                            if (children.childwidth > children.width) {
                                if (w == blocks.filter(id => id.parent == idval).length - 1) {
                                    zwidth += children.childwidth;
                                } else {
                                    zwidth += children.childwidth + paddingx;
                                }
                            } else {
                                if (w == blocks.filter(id => id.parent == idval).length - 1) {
                                    zwidth += children.width;
                                } else {
                                    zwidth += children.width + paddingx;
                                }
                            }
                        }
                        // 更新当前块的子宽度
                        blocks.filter(a => a.id == idval)[0].childwidth = zwidth;
                        // 移动到父块继续更新
                        idval = blocks.filter(a => a.id == idval)[0].parent;
                    }
                }
                // 更新根块的子宽度
                blocks.filter(id => id.id == idval)[0].childwidth = totalwidth;
            }
            
            // 如果是重排状态，重置状态和样式
            if (rearrange) {
                rearrange = false;
                drag.classList.remove("dragging");
            }
            
            // 重新排列所有块并检查偏移量
            rearrangeMe();
            checkOffset();
        }

        /**
         * 处理块的触摸或点击事件
         * @param {Event} event - 鼠标或触摸事件
         */
        function touchblock(event) {
            // 重置拖拽块状态
            dragblock = false;
            // 检查目标是否是块元素
            if (hasParentClass(event.target, "block")) {
                // 获取块元素
                var theblock = event.target.closest(".block");
                // 获取鼠标或触摸点的位置
                if (event.targetTouches) {
                    mouse_x = event.targetTouches[0].clientX;
                    mouse_y = event.targetTouches[0].clientY;
                } else {
                    mouse_x = event.clientX;
                    mouse_y = event.clientY;
                }
                // 如果不是鼠标松开事件且目标是块
                if (event.type !== "mouseup" && hasParentClass(event.target, "block")) {
                    // 如果不是右键点击
                    if (event.which != 3) {
                        // 如果当前没有活动拖拽或重排
                        if (!active && !rearrange) {
                            // 设置拖拽块状态
                            dragblock = true;
                            // 设置拖拽元素
                            drag = theblock;
                            // 计算鼠标与元素左上角的偏移量
                            dragx = mouse_x - (drag.getBoundingClientRect().left + window.scrollX);
                            dragy = mouse_y - (drag.getBoundingClientRect().top + window.scrollY);
                        }
                    }
                }
            }
        }

        /**
         * 检查元素或其父元素是否具有指定的类名
         * @param {Element} element - 要检查的元素
         * @param {string} classname - 要检查的类名
         * @returns {boolean} 元素或其父元素是否具有指定类名
         */
        function hasParentClass(element, classname) {
            // 检查当前元素是否有类名
            if (element.className) {
                // 检查当前元素的类名列表中是否包含指定类名
                if (element.className.split(' ').indexOf(classname) >= 0) return true;
            }
            // 递归检查父元素
            return element.parentNode && hasParentClass(element.parentNode, classname);
        }

        /**
         * 移动块的处理函数
         * @param {Event} event - 鼠标或触摸事件
         */
        flowy.moveBlock = function(event) {
            // 获取鼠标或触摸点的当前位置
            if (event.targetTouches) {
                mouse_x = event.targetTouches[0].clientX;
                mouse_y = event.targetTouches[0].clientY;
            } else {
                mouse_x = event.clientX;
                mouse_y = event.clientY;
            }
            if (dragblock) {
                rearrange = true;
                drag.classList.add("dragging");
                var blockid = parseInt(drag.querySelector(".blockid").value);
                prevblock = blocks.filter(a => a.id == blockid)[0].parent;
                blockstemp.push(blocks.filter(a => a.id == blockid)[0]);
                blocks = blocks.filter(function(e) {
                    return e.id != blockid
                });
                if (blockid != 0) {
                    document.querySelector(".arrowid[value='" + blockid + "']").parentNode.remove();
                }
                var layer = blocks.filter(a => a.parent == blockid);
                var flag = false;
                var foundids = [];
                var allids = [];
                while (!flag) {
                    for (var i = 0; i < layer.length; i++) {
                        if (layer[i] != blockid) {
                            blockstemp.push(blocks.filter(a => a.id == layer[i].id)[0]);
                            const blockParent = document.querySelector(".blockid[value='" + layer[i].id + "']").parentNode;
                            const arrowParent = document.querySelector(".arrowid[value='" + layer[i].id + "']").parentNode;
                            blockParent.style.left = (blockParent.getBoundingClientRect().left + window.scrollX) - (drag.getBoundingClientRect().left + window.scrollX) + "px";
                            blockParent.style.top = (blockParent.getBoundingClientRect().top + window.scrollY) - (drag.getBoundingClientRect().top + window.scrollY) + "px";
                            arrowParent.style.left = (arrowParent.getBoundingClientRect().left + window.scrollX) - (drag.getBoundingClientRect().left + window.scrollX) + "px";
                            arrowParent.style.top = (arrowParent.getBoundingClientRect().top + window.scrollY) - (drag.getBoundingClientRect().top + window.scrollY) + "px";
                            drag.appendChild(blockParent);
                            drag.appendChild(arrowParent);
                            foundids.push(layer[i].id);
                            allids.push(layer[i].id);
                        }
                    }
                    if (foundids.length == 0) {
                        flag = true;
                    } else {
                        layer = blocks.filter(a => foundids.includes(a.parent));
                        foundids = [];
                    }
                }
                for (var i = 0; i < blocks.filter(a => a.parent == blockid).length; i++) {
                    var blocknumber = blocks.filter(a => a.parent == blockid)[i];
                    blocks = blocks.filter(function(e) {
                        return e.id != blocknumber
                    });
                }
                for (var i = 0; i < allids.length; i++) {
                    var blocknumber = allids[i];
                    blocks = blocks.filter(function(e) {
                        return e.id != blocknumber
                    });
                }
                if (blocks.length > 1) {
                    rearrangeMe();
                }
                dragblock = false;
            }
            if (active) {
                drag.style.left = mouse_x - dragx + "px";
                drag.style.top = mouse_y - dragy + "px";
            } else if (rearrange) {
                drag.style.left = mouse_x - dragx - (window.scrollX + absx) + canvas_div.scrollLeft + "px";
                drag.style.top = mouse_y - dragy - (window.scrollY + absy) + canvas_div.scrollTop + "px";
                blockstemp.filter(a => a.id == parseInt(drag.querySelector(".blockid").value)).x = (drag.getBoundingClientRect().left + window.scrollX) + (parseInt(window.getComputedStyle(drag).width) / 2) + canvas_div.scrollLeft;
                blockstemp.filter(a => a.id == parseInt(drag.querySelector(".blockid").value)).y = (drag.getBoundingClientRect().top + window.scrollY) + (parseInt(window.getComputedStyle(drag).height) / 2) + canvas_div.scrollTop;
            }
            if (active || rearrange) {
                if (mouse_x > canvas_div.getBoundingClientRect().width + canvas_div.getBoundingClientRect().left - 10 && mouse_x < canvas_div.getBoundingClientRect().width + canvas_div.getBoundingClientRect().left + 10) {
                    canvas_div.scrollLeft += 10;
                } else if (mouse_x < canvas_div.getBoundingClientRect().left + 10 && mouse_x > canvas_div.getBoundingClientRect().left - 10) {
                    canvas_div.scrollLeft -= 10;
                } else if (mouse_y > canvas_div.getBoundingClientRect().height + canvas_div.getBoundingClientRect().top - 10 && mouse_y < canvas_div.getBoundingClientRect().height + canvas_div.getBoundingClientRect().top + 10) {
                    canvas_div.scrollTop += 10;
                } else if (mouse_y < canvas_div.getBoundingClientRect().top + 10 && mouse_y > canvas_div.getBoundingClientRect().top - 10) {
                    canvas_div.scrollLeft -= 10;
                }
                var xpos = (drag.getBoundingClientRect().left + window.scrollX) + (parseInt(window.getComputedStyle(drag).width) / 2) + canvas_div.scrollLeft - canvas_div.getBoundingClientRect().left;
                var ypos = (drag.getBoundingClientRect().top + window.scrollY) + canvas_div.scrollTop - canvas_div.getBoundingClientRect().top;
                var blocko = blocks.map(a => a.id);
                for (var i = 0; i < blocks.length; i++) {
                    if (checkAttach(blocko[i])) {
                        document.querySelector(".blockid[value='" + blocko[i] + "']").parentNode.appendChild(document.querySelector(".indicator"));
                        document.querySelector(".indicator").style.left = (document.querySelector(".blockid[value='" + blocko[i] + "']").parentNode.offsetWidth / 2) - 5 + "px";
                        document.querySelector(".indicator").style.top = document.querySelector(".blockid[value='" + blocko[i] + "']").parentNode.offsetHeight + "px";
                        document.querySelector(".indicator").classList.remove("invisible");
                        break;
                    } else if (i == blocks.length - 1) {
                        if (!document.querySelector(".indicator").classList.contains("invisible")) {
                            document.querySelector(".indicator").classList.add("invisible");
                        }
                    }
                }
            }
        }

        /**
         * 检查并调整块的偏移量，确保所有块都在可见区域内
         */
        function checkOffset() {
            // 获取所有块的x坐标
            offsetleft = blocks.map(a => a.x);
            // 获取所有块的宽度
            var widths = blocks.map(a => a.width);
            // 计算每个块的最左侧坐标
            var mathmin = offsetleft.map(function(item, index) {
                return item - (widths[index] / 2);
            })
            // 找出最小的左侧坐标，即最左边的块
            offsetleft = Math.min.apply(Math, mathmin);
            if (offsetleft < (canvas_div.getBoundingClientRect().left + window.scrollX - absx)) {
                var blocko = blocks.map(a => a.id);
                for (var w = 0; w < blocks.length; w++) {
                    document.querySelector(".blockid[value='" + blocks.filter(a => a.id == blocko[w])[0].id + "']").parentNode.style.left = blocks.filter(a => a.id == blocko[w])[0].x - (blocks.filter(a => a.id == blocko[w])[0].width / 2) - offsetleft + canvas_div.getBoundingClientRect().left - absx + 20 + "px";
                    if (blocks.filter(a => a.id == blocko[w])[0].parent != -1) {
                        var arrowblock = blocks.filter(a => a.id == blocko[w])[0];
                        var arrowx = arrowblock.x - blocks.filter(a => a.id == blocks.filter(a => a.id == blocko[w])[0].parent)[0].x;
                        if (arrowx < 0) {
                            document.querySelector('.arrowid[value="' + blocko[w] + '"]').parentNode.style.left = (arrowblock.x - offsetleft + 20 - 5) + canvas_div.getBoundingClientRect().left - absx + "px";
                        } else {
                            document.querySelector('.arrowid[value="' + blocko[w] + '"]').parentNode.style.left = blocks.filter(id => id.id == blocks.filter(a => a.id == blocko[w])[0].parent)[0].x - 20 - offsetleft + canvas_div.getBoundingClientRect().left - absx + 20 + "px";
                        }
                    }
                }
                for (var w = 0; w < blocks.length; w++) {
                    blocks[w].x = (document.querySelector(".blockid[value='" + blocks[w].id + "']").parentNode.getBoundingClientRect().left + window.scrollX) + (canvas_div.scrollLeft) + (parseInt(window.getComputedStyle(document.querySelector(".blockid[value='" + blocks[w].id + "']").parentNode).width) / 2) - 20 - canvas_div.getBoundingClientRect().left;
                }
            }
        }

        /**
         * 重新排列所有块，使其排列整齐
         */
        function rearrangeMe() {
            // 获取所有块的父块ID
            var result = blocks.map(a => a.parent);
            // 遍历所有父块ID
            for (var z = 0; z < result.length; z++) {
                // 跳过根块（没有父块的块）
                if (result[z] == -1) {
                    z++;
                }
                // 初始化总宽度和偏移量
                var totalwidth = 0;
                var totalremove = 0;
                var maxheight = 0;
                for (var w = 0; w < blocks.filter(id => id.parent == result[z]).length; w++) {
                    var children = blocks.filter(id => id.parent == result[z])[w];
                    if (blocks.filter(id => id.parent == children.id).length == 0) {
                        children.childwidth = 0;
                    }
                    if (children.childwidth > children.width) {
                        if (w == blocks.filter(id => id.parent == result[z]).length - 1) {
                            totalwidth += children.childwidth;
                        } else {
                            totalwidth += children.childwidth + paddingx;
                        }
                    } else {
                        if (w == blocks.filter(id => id.parent == result[z]).length - 1) {
                            totalwidth += children.width;
                        } else {
                            totalwidth += children.width + paddingx;
                        }
                    }
                }
                if (result[z] != -1) {
                    blocks.filter(a => a.id == result[z])[0].childwidth = totalwidth;
                }
                for (var w = 0; w < blocks.filter(id => id.parent == result[z]).length; w++) {
                    var children = blocks.filter(id => id.parent == result[z])[w];
                    const r_block = document.querySelector(".blockid[value='" + children.id + "']").parentNode;
                    const r_array = blocks.filter(id => id.id == result[z]);
                    r_block.style.top = r_array.y + paddingy + canvas_div.getBoundingClientRect().top - absy + "px";
                    r_array.y = r_array.y + paddingy;
                    if (children.childwidth > children.width) {
                        r_block.style.left = r_array[0].x - (totalwidth / 2) + totalremove + (children.childwidth / 2) - (children.width / 2) - (absx + window.scrollX) + canvas_div.getBoundingClientRect().left + "px";
                        children.x = r_array[0].x - (totalwidth / 2) + totalremove + (children.childwidth / 2);
                        totalremove += children.childwidth + paddingx;
                    } else {
                        r_block.style.left = r_array[0].x - (totalwidth / 2) + totalremove - (absx + window.scrollX) + canvas_div.getBoundingClientRect().left + "px";
                        children.x = r_array[0].x - (totalwidth / 2) + totalremove + (children.width / 2);
                        totalremove += children.width + paddingx;
                    }

                    var arrowblock = blocks.filter(a => a.id == children.id)[0];
                    var arrowx = arrowblock.x - blocks.filter(a => a.id == children.parent)[0].x + 20;
                    var arrowy = paddingy;
                    updateArrow(arrowblock, arrowx, arrowy, children);
                }
            }
        }
        
        document.addEventListener("mousedown", flowy.beginDrag);
        document.addEventListener("mousedown", touchblock, false);
        document.addEventListener("touchstart", flowy.beginDrag);
        document.addEventListener("touchstart", touchblock, false);
        

        document.addEventListener("mouseup", touchblock, false);
        document.addEventListener("mousemove", flowy.moveBlock, false);
        document.addEventListener("touchmove", flowy.moveBlock, false);

        document.addEventListener("mouseup", flowy.endDrag, false);
        document.addEventListener("touchend", flowy.endDrag, false);
    }

    /**
     * 块被抓取时的回调函数
     * @param {Element} block - 被抓取的块元素
     */
    function blockGrabbed(block) {
        grab(block);
    }

    /**
     * 块被释放时的回调函数
     */
    function blockReleased() {
        release();
    }

    /**
     * 检查块是否可以连接
     * @param {Element} drag - 被拖拽的块
     * @param {boolean} first - 是否是第一个块
     * @param {Element} parent - 父块元素
     * @returns {boolean} 是否可以连接
     */
    function blockSnap(drag, first, parent) {
        return snapping(drag, first, parent);
    }

    /**
     * 块被删除前的检查
     * @param {Element} drag - 被拖拽的块
     * @param {Object} parent - 父块对象
     * @returns {boolean} 是否允许删除
     */
    function beforeDelete(drag, parent) {
        return rearrange(drag, parent);
    }

    /**
     * 为多个元素添加事件监听器
     * @param {string} type - 事件类型
     * @param {Function} listener - 事件监听器函数
     * @param {boolean} capture - 是否在捕获阶段执行
     * @param {string} selector - 选择器，用于选择要添加事件的元素
     */
    function addEventListenerMulti(type, listener, capture, selector) {
        // 获取所有匹配选择器的元素
        var nodes = document.querySelectorAll(selector);
        // 遍历添加事件监听器
        for (var i = 0; i < nodes.length; i++) {
            nodes[i].addEventListener(type, listener, capture);
        }
    }

    /**
     * 为多个元素移除事件监听器
     * @param {string} type - 事件类型
     * @param {Function} listener - 事件监听器函数
     * @param {boolean} capture - 是否在捕获阶段执行
     * @param {string} selector - 选择器，用于选择要移除事件的元素
     */
    function removeEventListenerMulti(type, listener, capture, selector) {
        // 获取所有匹配选择器的元素
        var nodes = document.querySelectorAll(selector);
        // 遍历移除事件监听器
        for (var i = 0; i < nodes.length; i++) {
            nodes[i].removeEventListener(type, listener, capture);
        }
    }
    
    flowy.load();
}
