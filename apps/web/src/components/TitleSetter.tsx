'use client'

import { useEffect } from 'react'

// NextJS App Router removed the Head / title element in favor of
// `generateMetadata`.
// `generateMetadata` doesn't respond to client side changes (like, changing the
// language).
// Browsers _do_ seem to handle a `<title>` anywhere, but that's not valid per
// the spec.
// NextJS App Router really doesn't seem well thought out.
const TitleSetter: React.FC<{ children: string }> = (props) => {
  useEffect(() => {
    document.title = `${props.children.trim()} | Budget`
  }, [props.children])

  return null
}

export default TitleSetter
