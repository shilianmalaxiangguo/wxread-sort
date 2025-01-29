export const config = {
  matches: ["*://weread.qq.com/*"]
}

export {}

console.log("Content script loaded") // 用于调试

interface Book {
  title: string;
  coverUrl: string;
}

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_BOOKS") {
    try {
      // 获取书架上的所有书籍元素
      const bookElements = document.querySelectorAll('.shelf_list .shelfBook')
      console.log(`找到 ${bookElements.length} 本书`)
      
      const books: Book[] = []

      bookElements.forEach((element) => {
        const titleElement = element.querySelector('.title')
        const coverElement = element.querySelector('.wr_bookCover_img')

        if (titleElement && coverElement) {
          books.push({
            title: titleElement.textContent?.trim() || '',
            coverUrl: (coverElement as HTMLImageElement).src || ''
          })
        }
      })

      console.log("解析到的书籍：", books)

      // 发送响应
      sendResponse({
        books: books,
        rawBooks: Array.from(bookElements)
      })
    } catch (error) {
      console.error('Error in content script:', error)
      sendResponse({ error: error.message })
    }
  }
  return true // 保持消息通道开放
}) 