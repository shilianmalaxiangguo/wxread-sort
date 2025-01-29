import { useState, useEffect } from "react"
import "./style.css"

interface Book {
  title: string;
  coverUrl: string;
}

function IndexPopup() {
  const [bookList, setBookList] = useState<Book[]>([])
  const [rawBooks, setRawBooks] = useState<any>(null)
  const [error, setError] = useState<string>("")

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
