from typing import List, Dict,Any
import uuid
import os
from fastapi import FastAPI,Request,HTTPException
from fastapi.staticfiles import StaticFiles
from langchain_core.prompts import ChatPromptTemplate,PromptTemplate,MessagesPlaceholder,HumanMessagePromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_community.chat_models import ChatZhipuAI
from langserve import add_routes
from dotenv import load_dotenv,find_dotenv

from fastapi.middleware.cors import CORSMiddleware
from langchain.agents import Tool
from langchain_community.tools.tavily_search import TavilySearchResults
from langgraph.prebuilt import create_react_agent
from langchain.agents import AgentExecutor
from langchain.chains.llm import LLMChain
from langchain.agents import load_tools, initialize_agent
from langchain.agents import AgentType
from langchain.memory import ConversationBufferMemory
from langchain_core.messages import SystemMessage
import logging
# import route_planning
from pydantic import BaseModel
#———————————————APP定义开始—————————————————————
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 静态文件
app.mount("/static", StaticFiles(directory="static"), name="static")
#———————————————APP定义结束——————————————————
# 1. Create prompt template
system_template = "请根据下面的信息规划一个旅行"
prompt_template = ChatPromptTemplate.from_messages([
    ("system", system_template),
    ("user", "{details}")
])


# 2 获取你的智谱 API Key
_ = load_dotenv(find_dotenv())

# 3. Create model
model = ChatZhipuAI(model="glm-4",temperature=0.5)

# 4.create parser
parser = StrOutputParser()

# 5. Create agent
chain = prompt_template | model | parser

#定义搜索工具
search_tool = TavilySearchResults(max_results=2,tavily_api_key=os.environ["TAVILY_API_KEY"])
tools = [search_tool]


##multi-agent
# scenario_description = PromptTemplate("您是{city}的导游。您需要提供有关热门旅游景点、当地美食和文化规范的信息。")
 
# questions = [
#     PromptTemplate("在{city}中有哪些热门旅游景点？"),
#     PromptTemplate("{city}有哪些必尝的当地美食？"),
#     PromptTemplate("在{city}中有哪些文化规范或礼仪需要游客了解？")
# ]
#格式化搜索结果
def format_search_results(results):
    # Extract relevant parts of the search results
    formatted_results = []
    for result in results:
        title = result.get('title', 'No Title')
        snippet = result.get('snippet', 'No Snippet')
        formatted_results.append(f"Title: {title}\nSnippet: {snippet}")
    return "\n\n".join(formatted_results)

#(1)general
prompt_general=ChatPromptTemplate.from_messages([
    ("system","""
     你是一位友好、知识渊博且高效的旅游规划助手。\
     请根据用户提供的时间和地点计划每一天的旅行出行计划，考虑交通和住宿，推荐景点和餐饮选择，并添加文化小贴士和安全建议。
     """),
    # few_shot_prompt_general,
    ("human","{input}")
])
llm_chain_general = LLMChain(llm = model, prompt = prompt_general)

general_tool=Tool(
    name='general model',
    func=llm_chain_general.run,
    description='use this tool for general purpose input'
)
tools.append(general_tool)



#（2）food
prompt_food=ChatPromptTemplate.from_messages([
    ("system","""
     你是一位友好、知识渊博且高效的旅游规划助手以及有丰富经验且热衷于美食的助手。\
     请根据用户提供的时间和地点计划每一天的旅行出行计划，考虑交通和住宿，推荐景点和餐饮选择，并添加文化小贴士和安全建议。再额外推荐当地的美食，并给出推荐美食的具体位置。
     """),
    ("human","{context}\n\n问题: {query}")
])
llm_chain_food = LLMChain(llm = model, prompt = prompt_food)
def combined_food(query):
   
    # Step 1: Perform the search using TavilySearch
    search_results = search_tool.invoke(query)
    
    # Step 2: Format the search results
    formatted_results = format_search_results(search_results)
    
    # Step 3: Combine formatted results with the query and use LLMChain
    final_context = formatted_results
    final_prompt = {
        "context": final_context,
        "query": query
    }
    
    # Generate the final response using LLMChain
    response = llm_chain_food.run(input=final_prompt)
    return response

food_tool=Tool(
    name='food model',
    func=combined_food,
    description='use this tool for food purpose input'
)
tools.append(food_tool)

#(3)hotel
prompt_hotel=ChatPromptTemplate.from_messages([
    ("system","""
     你是一位有丰富经验且对于当地住宿情况很了解的导游。\
     请根据用户提供的时间和地点计划每一天的旅行出行计划，推荐景点和餐饮选择，并添加文化小贴士和安全建议。再额外给出成都的酒店推荐，给出对应的地理位置，优势，价格。
     """),
    ("human","{input}")
])
llm_chain_hotel = LLMChain(llm = model, prompt = prompt_hotel)
hotel_tool=Tool(
    name='hotel model',
    func=llm_chain_hotel.run,
    description='use this tool for hotel purpose input'
)
tools.append(hotel_tool)
# -----------------------出行助手部分开始---------------------------------
#(4)go
import requests

#data=route_planning.route_transit_planning()
#请结合{data}内容
prompt_go=ChatPromptTemplate.from_messages([
    ("system",f"""
     你是一位熟悉路线规划的助手\  
     计划旅行出行计划，推荐景点和餐饮选择，并添加文化小贴士和安全建议。再额外提供用户出行的方式，给出相关建议。
     """),
    ("human","{input}")
])
llm_chain_go = LLMChain(llm = model, prompt = prompt_go)
go_tool=Tool(
    name='go model',
    func=llm_chain_go.run,
    description='use this tool for go purpose input'
)
tools.append(go_tool)

# -----------------------出行助手部分结束---------------------------------
user_prompt = """
    ## Setup:
    - persona: Friendly, knowledgeable, and efficient travel planning assistant.
    - context: The user is planning a {days}-day trip to {destination} and needs a detailed travel itinerary.

    ## The Instruction:
    - instruction: Create a detailed {days}-day travel itinerary for a trip to {destination}, including recommendations for flights, accommodations, local transportation, must-see attractions, dining options, cultural tips, and safety advice. Ensure the itinerary is easy to follow and covers a variety of experiences, from sightseeing to local cuisine.
    - few-shot prompting: 
      - Day 1: Arrival in Tokyo
        - Morning: Arrive in Tokyo and check into your hotel.
        - Afternoon: Explore Asakusa and visit the Sensoji Temple.
        - Evening: Dinner at a local sushi restaurant.
      - Day 2: Tokyo
        - Morning: Visit the Tsukiji Fish Market.
        - Afternoon: Walk through the Ginza shopping district.
        - Evening: Enjoy a night view from Tokyo Tower.
    
    """
prompt = ChatPromptTemplate.from_messages(
    [
        SystemMessage(content="你是一个旅游规划助手。要根据用户提供的旅游地等信息，给出具体的攻略。做出以下模板的回答："+user_prompt),
        MessagesPlaceholder(variable_name="chat_history"),
        HumanMessagePromptTemplate.from_template("{question}"),
        # SystemMessage(content="工具可用性: {tool_names}"),
        # SystemMessage(content="代理临时记录: {agent_scratchpad}"),
    ]
)
memory = ConversationBufferMemory(memory_key="chat_history", return_messages=True)
#定义agent
agent= initialize_agent(
    tools, 
    [],
    agent=AgentType.CHAT_ZERO_SHOT_REACT_DESCRIPTION,
    handle_parsing_errors=True,
    verbose = True,   
    agent_kwargs={     
        "extra_prompt_messages":[MessagesPlaceholder(variable_name="chat_history"),prompt],    
    },    
    memory=memory #记忆组件    
    )


# #启动agent
# input_text = "我七月想要去巴黎旅行七天，我需要一个七天的攻略"
# output_text=agent(input_text)
# print(output_text)

# input_text1 = "我七月去哪？"
# output_text1=agent(input_text1)
# print(output_text1)


# input_text3="巴黎奥运会举办的具体地址，可以进去参观吗？"
# output_text3=agent(input_text3)
# print(output_text3)

class InputData(BaseModel):
    input: dict
    config: dict

@app.post("/plan_trip")
async def plan_trip(details: InputData):
    try:
        # 从 details 中提取 input_text
        input_text = details.input.get("input_text")
        
        # 打印接收到的数据（用于调试）
        print("接收到的数据:", details)
        print("input_text:", input_text)
        output_text = agent(input_text)

        print("output_text:",output_text)
        return {"result": output_text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000,log_level="debug")
"""
python serve.py

每个 LangServe 服务都带有一个简单的内置 UI，用于配置和调用应用程序，并提供流式输出和中间步骤的可见性。
前往 http://localhost:8000/chain/playground/ 试用！
传入与之前相同的输入 - {"language": "chinese", "text": "hi"} - 它应该会像以前一样做出响应。
"""