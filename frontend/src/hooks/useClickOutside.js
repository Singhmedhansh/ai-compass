import { useEffect, useRef } from 'react'

function useClickOutside(onClickOutside) {
  const ref = useRef(null)

  useEffect(() => {
    function handlePointerDown(event) {
      const element = ref.current

      if (!element || element.contains(event.target)) {
        return
      }

      onClickOutside?.(event)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
    }
  }, [onClickOutside])

  return ref
}

export default useClickOutside