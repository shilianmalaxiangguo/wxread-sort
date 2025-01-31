import { useState, useEffect, useRef } from "react"
import "./style.css"

interface Book {
  title: string;
  coverUrl: string;
}

function IndexPopup() {
  const [bookList, setBookList] = useState<Book[]>([])
  const [rawBooks, setRawBooks] = useState<any>(null)
  const [error, setError] = useState<string>("")
  const [preference, setPreference] = useState("")
  const [recommendation, setRecommendation] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [fullText, setFullText] = useState("")
  const [displayText, setDisplayText] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout>()

  useEffect(() => {
    const getBooks = async () => {
      try {
        // 获取当前标签页信息
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        if (!tab.id || !tab.url?.includes("weread.qq.com")) {
          setError("请在微信读书页面打开此扩展")
          return
        }

        // 获取 wr_vid cookie
        const cookie = await chrome.cookies.get({
          url: 'https://weread.qq.com',
          name: 'wr_vid'
        })

        if (cookie) {
          console.log("Got wr_vid:", cookie.value)
        }

        // 获取书籍数据
        const response = await chrome.tabs.sendMessage(tab.id!, {
          type: "GET_BOOKS",
          vid: cookie?.value
        })
        
        // 添加调试日志
        console.log("Sending message to tab:", tab.id)
        console.log("Response from content script:", response)
        
        if (chrome.runtime.lastError) {
          console.error("Runtime error:", chrome.runtime.lastError)
          setError(`获取数据失败：${chrome.runtime.lastError.message}`)
          return
        }
        
        console.log("Response received:", response)
        
        if (response && response.books) {
          setBookList(response.books)
          if (response.rawBooks) {
            setRawBooks(response.rawBooks)
            console.log("Got raw books:", response.rawBooks)
          }
        } else {
          setError("未找到书籍数据")
        }

      } catch (error) {
        console.error('Error:', error)
        setError("获取书籍列表失败，请确保在微信读书页面并刷新重试")
      }
    }

    getBooks()
  }, [])

  // 优化的打字机效果
  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    if (!fullText) {
      setDisplayText("")
      setIsTyping(false)
      return
    }

    if (fullText === displayText) {
      setIsTyping(false)
      return
    }

    setIsTyping(true)
    
    // 减小文本块大小，增加更新频率
    const chunkSize = 3 // 每次显示3个字符
    const currentLength = displayText.length
    
    if (currentLength < fullText.length) {
      timeoutRef.current = setTimeout(() => {
        setDisplayText(fullText.slice(0, currentLength + chunkSize))
      }, 16) // 约60fps的更新频率
    } else {
      setIsTyping(false)
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [fullText, displayText])

  const getRecommendation = async () => {
    setIsLoading(true)
    setFullText("")
    setDisplayText("")
    
    try {
      const bookTitles = bookList.map(book => book.title).join(", ")
      const prompt = `
基于以下信息给出阅读建议：

用户阅读偏好：${preference}

当前书架上的书籍：${bookTitles}

请分析用户的阅读偏好和现有书单，给出具体的阅读建议，包括：
1. 现有书单中最适合优先阅读的3本书
2. 基于用户偏好的阅读顺序建议
3. 可能感兴趣的其他书籍推荐
      `.trim()

      const response = await fetch("http://localhost:11434/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "deepseek-r1:7b",
          prompt: prompt,
          raw: true,
          stream: true
        })
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let accumulatedResponse = ""

      if (reader) {
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            const chunk = decoder.decode(value)
            try {
              const jsonChunk = JSON.parse(chunk)
              if (jsonChunk.response) {
                accumulatedResponse += jsonChunk.response
                setFullText(accumulatedResponse)
              }
            } catch (e) {
              console.warn("Failed to parse chunk:", chunk)
            }
          }
        } finally {
          reader.releaseLock()
        }
      }
    } catch (error) {
      console.error("获取推荐失败:", error)
      setFullText(`获取推荐失败，详细错误：${error.message}\n\n请确保：
1. Ollama 服务正在运行 (ollama serve)
2. 已正确安装 deepseek-r1:7b 模型 (ollama pull deepseek-r1:7b)
3. 端口 11434 可访问`)
    } finally {
      setIsLoading(false)
    }
  }

  const exportBookList = () => {
    const titles = bookList.map(book => book.title).join('\n')
    const blob = new Blob([titles], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'weread-books.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="w-[600px] h-[400px] bg-white p-4 overflow-auto relative">
      <div className="mb-4">
        <textarea
          value={preference}
          onChange={(e) => setPreference(e.target.value)}
          placeholder="请输入你的阅读偏好，例如：我喜欢心理学和哲学类书籍，最近对人工智能比较感兴趣..."
          className="w-full h-24 p-2 border rounded resize-none"
        />
        <button
          onClick={getRecommendation}
          disabled={isLoading || !preference || bookList.length === 0}
          className="mt-2 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded disabled:bg-gray-300"
        >
          {isLoading ? "获取推荐中..." : "获取阅读建议"}
        </button>
      </div>

      {fullText && (
        <div className="mb-4 p-3 bg-gray-50 rounded">
          <h3 className="font-bold mb-2 text-sm">阅读建议：</h3>
          <div className="whitespace-pre-line leading-7 text-sm text-gray-700">
            <div className="relative">
              <div className="min-h-[100px] px-2">
                {displayText}
                {isTyping && (
                  <span className="inline-block w-1.5 h-3.5 ml-0.5 align-middle bg-gray-400 animate-pulse">
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <button 
        onClick={exportBookList}
        className="absolute top-4 right-4 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
      >
        导出书单
      </button>

      <h2 className="text-xl font-bold mb-4">我的书架</h2>
      {error ? (
        <p className="text-red-500">{error}</p>
      ) : bookList.length === 0 ? (
        <p className="text-gray-500">加载中...</p>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {bookList.map((book, index) => (
            <div key={index} className="flex items-center space-x-4 p-2 hover:bg-gray-100 rounded">
              <img 
                src={book.coverUrl} 
                alt={book.title} 
                className="w-16 h-20 object-cover rounded"
              />
              <span className="text-gray-700 flex-1">{book.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default IndexPopup
