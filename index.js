document.querySelector("#btn-fold-in").addEventListener("click", (e) => {
    const sidebar = document.querySelector(".sidebar");
    sidebar.style.width = 0

    const btnFoldOut = document.querySelector("#btn-fold-out");
    btnFoldOut.style.display = "inline-block"
})

document.querySelector("#input-send").addEventListener("click", (e) => {
    sendRequest()
    //sendRouteRequest()
})

document.querySelector("#input-chat").addEventListener("keydown", (e) => {
    if(e.keyCode === 13) { 
        sendRequest()
    }
})
//在这里增加一个往某个框里输入东西就会调用sendquest的逻辑

document.querySelector("#btn-fold-out").addEventListener("click", (e) => {
    const sidebar = document.querySelector(".sidebar");
    sidebar.style.width = "260px"

    e.target.style.display = "none"
})


//let uri = "/chain/tagging_pure/stream_log"
let uri = "/plan_trip";
function sendRequest(){
    const text = document.querySelector("#input-chat").value
    //将用户输入的文本封装到 data 对象中，以 JSON 格式准备发送给后端。
    const data = {
        input: {
            input_text: text,
        },
        config: {}
    }; 

     // 打印数据对象
     console.log("发送的数据对象:", data);

     // 打印 JSON 字符串
     console.log("发送的 JSON 字符串:", JSON.stringify(data));
    //创建一个新的 div 元素，包含用户的输入文本，并将其添加到 #res-log 元素中，用于显示用户消息。
    const resLog = document.querySelector("#res-log")
    const selfMsg = document.createElement("div");
    selfMsg.innerText = text;
    selfMsg.className = "self-msg"
    resLog.appendChild(selfMsg);

    //创建一个 div 和一个 p 元素用于显示来自后台的响应消息。
    const llmMsg = document.createElement("div");
    const llmMsg_P = document.createElement("p");
    llmMsg.className = "llm-msg"
    llmMsg.appendChild(llmMsg_P);
    resLog.appendChild(llmMsg);

    //  使用 Fetch API 发送一个 POST 请求到指定的 uri，请求体包含了用户的输入数据。
    fetch(`http://127.0.0.1:8000${uri}`,{
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data),
    }).then(response => {
        if (response.ok) {
            //获取响应体的 ReadableStream 读取器，并使用 TextDecoder 解码字节流。
            console.log("响应成功，开始解码！")
            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            const res = llmMsg_P;

            //read 函数用于持续读取流数据。每次读取一部分数据，解码后检查是否已完成 (done)，并处理数据。
            //完成时，添加工具栏到消息中。
            //定义读取消息的函数
            function read() {
                //调用 reader.read() 从流中读取数据，这个方法返回一个 Promise，then 方法的回调函数接收两个参数：
                reader.read().then(({ done, value }) => {
                    //判断控制流是否结束
                    if (done) {
                        console.log('Stream closed');
                        const llmMsg_toolbar = document.createElement("div");
                        //消息回复时的工具栏
                        llmMsg_toolbar.className = "tool-bar"
                        llmMsg_toolbar.innerHTML = `
                            <span class="iconfont icon-fuzhi"></span>
                            <span class="iconfont icon-shuaxin"></span>
                            <span class="iconfont icon-cai"></span>
                        `
                        /*将工具栏添加到 llmMsg 元素中（llmMsg 是一个用于显示消息的 DOM 元素）。
                        使用 return 结束 read 函数的执行，不再处理后续数据。*/
                        llmMsg.appendChild(llmMsg_toolbar);
                        return;
                    }

                    const chunk = decoder.decode(value, { stream: true });
                    console.log(1000,chunk.split('\r\n'))
                    //按行解码字符串
                    chunk.split('\r\n').forEach(eventString => {
                        console.log(1000,eventString);
                        if (eventString && eventString.startsWith('data: ')) {
                            console.log(2000,eventString);
                            const str = eventString.substring("data: ".length);
                            const data = JSON.parse(str)
                            console.log(3000,data);
                            for(const item of data.ops){
                                //追加内容
                                if(item.op === "add" && item.path === "/logs/ChatOpenAI/streamed_output_str/-"){
                                    console.log("item_value为：")
                                    console.log(item.value)
                                    res.innerHTML += item.value;  
                                }//格式化为 JSON 字符串，并显示在 res 元素中。然后用 break 跳出循环，停止处理更多数据。
                                if(item.op === "add" && item.path === "/logs/PydanticToolsParser/final_output"){
                                    if(String(item.value.output) !== "null" && String(item.value.output) !== "undefined"){
                                        console.log("最终的数据为：")
                                        console.log(JSON.stringify(item.value.output, null, 2))
                                        res.innerHTML = `<pre>${JSON.stringify(item.value.output, null, 2)}</pre>`;
                                        break;
                                    }
                                }
                            }
                        }
                    });
                    
                    //递归调用
                    read();
                }).catch(error => {
                    console.error('Stream error', error);
                });
            }
            //调用这个函数
            console.log("开始读取")
            read();
        } else {
            console.error('Network response was not ok.');
        }
    }).catch(error => {
        console.error('Fetch error:', error);
    });    
}
// //调用高德API的路径函数
// function sendRouteRequest() {
//     // 获取两个地点的输入值，俩框里得
//     // const startLocation = document.querySelector("#start-location").value;
//     // const endLocation = document.querySelector("#end-location").value;

//     const startLocation="北京"
//     const endLocation="天津"
//     // 构造 API 请求的 URL
//     const apiKey = 'a3def9481a74e48c846e31bbff27c403';
//     const apiUrl = `https://restapi.amap.com/v3/direction/driving?key=${apiKey}&origin=${encodeURIComponent(startLocation)}&destination=${encodeURIComponent(endLocation)}&output=json`;

//     // 打印获取的地址和构造的 API 请求 URL
//     console.log("起点地址:", startLocation);
//     console.log("终点地址:", endLocation);
//     console.log("API 请求 URL:", apiUrl);

//     // 创建一个新的 div 元素，用于显示请求的起点和终点
//     const resLog = document.querySelector("#res-log");
//     const selfMsg = document.createElement("div");
//     selfMsg.innerText = `起点: ${startLocation}\n终点: ${endLocation}`;
//     selfMsg.className = "self-msg";
//     resLog.appendChild(selfMsg);

//     // 使用 Fetch API 发送一个 GET 请求到高德地图 API
//     fetch(apiUrl)
//         .then(response => response.json())
//         .then(data => {
//             // 打印 API 返回的数据
//             console.log("API 返回的数据:", data);

//             // 创建一个 div 和一个 p 元素用于显示来自高德地图 API 的响应消息
//             const routeMsg = document.createElement("div");
//             const routeMsg_P = document.createElement("p");
//             routeMsg.className = "route-msg";
//             routeMsg.appendChild(routeMsg_P);
//             resLog.appendChild(routeMsg);

//             // 检查 API 返回的数据
//             if (data.status === '1' && data.route && data.route.paths.length > 0) {
//                 // 获取路径规划结果
//                 const route = data.route.paths[0];
//                 const distance = route.distance;
//                 const duration = route.duration;
//                 const steps = route.steps.map(step => step.instruction).join('<br>');

//                 // 显示路径规划结果
//                 routeMsg_P.innerHTML = `
//                     路径距离: ${distance} 米<br>
//                     预计时间: ${duration} 秒<br>
//                     路径步骤:<br>${steps}
//                 `;
//             } else {
//                 // 处理 API 返回的错误或没有路径的情况
//                 routeMsg_P.innerText = "未能获取路径规划结果。";
//             }
//         })
//         .catch(error => {
//             console.error('Fetch 错误:', error);
//         });
// }
// 等待页面加载完成后执行
window.onload = function() {
    // 创建地图实例
    const map = new AMap.Map('map-container', {
        zoom: 10,
        center: [116.397428, 39.90923] // 默认中心点
    });

    console.log('地图实例已创建');

    // 加载路径规划和地理编码插件
    AMap.plugin(['AMap.Driving', 'AMap.Geocoder'], function() {
        console.log('插件已加载');

        // 创建路径规划函数
        function planRoute(startLocation, endLocation) {
            console.log('开始规划路线');
            console.log('起点:', startLocation);
            console.log('终点:', endLocation);

            // 创建一个路径规划实例
            const driving = new AMap.Driving({
                map: map,
                panel: 'panel' // 结果显示的面板，若不需要可去掉此行
            });

            console.log('路径规划实例已创建');

            // 创建地理编码实例
            const geocoder = new AMap.Geocoder()
            console.log('地理编码实例已创建');
        
            // 使用地理编码服务将地址转换为经纬度
            geocoder.getLocation(startLocation, (status, result) => {

                console.log('地理编码起点结果:', status, result);
                if (status === 'complete' && result.info === 'OK') {
                    const startLngLat = result.geocodes[0].location;
                    console.log('起点经纬度:', startLngLat);
                    // 获取经度（lng）和纬度（lat）
                    geocoder.getLocation(endLocation, (status, result) => {
                        console.log('地理编码终点结果:', status, result);
                        
                        if (status === 'complete' && result.info === 'OK') {
                            const endLngLat = result.geocodes[0].location;
                            console.log('终点经纬度:', endLngLat);
                            // 调用路径规划服务
                    
                            driving.search(startLngLat,endLngLat, function (status, result) {
                                // result 即是对应的驾车导航信息，相关数据结构文档请参考  https://lbs.amap.com/api/javascript-api/reference/route-search#m_DrivingResult
                                if (status === 'complete') {
                                  map.setCenter(startLngLat)
                                } else {
                                  console.log('获取驾车数据失败：' + result)
                                }
                              });
                        } else {
                            console.error('终点地址地理编码失败:', result);
                        }
                    });
                } else {
                    console.error('起点地址地理编码失败:', result);
                }
            });
        }

        // 示例调用函数
        // 你可以根据实际需求将此部分代码替换为从前端获取输入并调用 planRoute 函数
        const startLocation = '北京';  // 示例起点
        const endLocation = '上海';    // 示例终点
        planRoute(startLocation, endLocation);
    });
};

//它的功能是根据用户在下拉菜单中选择的选项来更新一个 URL（uri 变量），该 URL 将用于后续的 HTTP 请求。
const selectLLM = document.getElementById('selectLLM');
selectLLM.addEventListener('change', function() {
    const selectedOption = this.options[this.selectedIndex];
    console.log('Selected option:', selectedOption.value);
    uri = `/chain/${selectedOption.value}/stream_log`
});