import { useState, useRef, useEffect } from 'react'

interface Option {
  value: string
  label: string
}

interface CustomSelectProps {
  value: string
  options: Option[]
  onChange: (value: string) => void
  className?: string
  style?: React.CSSProperties
}

export default function CustomSelect({ value, options, onChange, className = '', style }: CustomSelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const selected = options.find(o => o.value === value)

  return (
    <div className={`custom-select ${className}`} ref={ref} style={style} tabIndex={0} onBlur={() => setOpen(false)}>
      <button type="button" className={`custom-select-btn${open ? ' open' : ''}`} onClick={() => setOpen(o => !o)} aria-haspopup="listbox" aria-expanded={open}>
        <span>{selected ? selected.label : ''}</span>
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" style={{marginLeft:8}}><path d="M6 8l4 4 4-4" stroke="#ea580c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
      {open && (
        <ul className="custom-select-list" role="listbox">
          {options.map(opt => (
            <li key={opt.value} role="option" aria-selected={opt.value === value} className={opt.value === value ? 'selected' : ''}
              onMouseDown={e => { e.preventDefault(); onChange(opt.value); setOpen(false) }}>
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
