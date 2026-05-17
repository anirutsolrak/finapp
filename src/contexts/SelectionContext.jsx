import { createContext, useContext, useState } from 'react'

const SelectionCtx = createContext({ active: false, setActive: () => {} })

export function SelectionProvider({ children }) {
  const [active, setActive] = useState(false)
  return <SelectionCtx.Provider value={{ active, setActive }}>{children}</SelectionCtx.Provider>
}

export const useSelection = () => useContext(SelectionCtx)
