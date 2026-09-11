import { useState } from 'react'
import { Popover, type AnchorPosition } from './Popover'

const EMOJIS = [
  '😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 😉 😍 🥰 😘 😎 🤓 🧐 🤔 🤩 🥳 😴 🤯 😱 🙌 👏 👍 👎 👀 💪 🙏 🤝',
  '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 ✨ ⭐ 🌟 🔥 💡 📌 📍 📎 📝 ✏️ 📚 📖 🗂️ 📁 📅 ⏰ ⏳ ✅ ☑️ ❌ ⚠️ ❗ ❓ 💬',
  '💭 🎯 🚀 🎉 🎨 🎬 📷 🎵 🎧 🎮 🏆 💰 💎 🔑 🔒 🛠️ ⚙️ 🧩 🧪 🌈 ☀️ 🌙 ⛅ 🌊 🌸 🌿 🍀 🍎 🍕 ☕ 🍷',
  '🏠 🏢 ✈️ 🌍 🗺️ 🐶 🐱 🦊 🐻 🐼 🦄 🐝',
]
  .join(' ')
  .split(' ')

interface Props {
  position: AnchorPosition
  onSelect: (emoji: string) => void
  onClose: () => void
}

export function EmojiPicker({ position, onSelect, onClose }: Props) {
  const [custom, setCustom] = useState('')
  const pick = (emoji: string) => {
    onSelect(emoji)
    onClose()
  }

  return (
    <Popover position={position} className="popover emoji-picker" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (custom.trim()) pick(custom.trim())
        }}
      >
        <input
          className="popover-input"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="Type or paste any emoji…"
          autoFocus
        />
      </form>
      <div className="emoji-grid">
        {EMOJIS.map((emoji) => (
          <button key={emoji} type="button" onClick={() => pick(emoji)}>
            {emoji}
          </button>
        ))}
      </div>
    </Popover>
  )
}
