'use client'

import { Box, CircularProgress, Typography } from '@mui/material'
import { useEffect, useMemo, useState } from 'react'

export default function Loader() {
  const [index, setIndex] = useState(0)
  const messages = useMemo(() => {
    return [
      'Reticulating splnes',
      'Generating witty dialog',
      'Swapping time and space',
      'Spinning the wheel of fortune',
      "We're building the buildings as fast as we can",
      'We need more dilithium crystals',
      "Time flies when you're having fun",
      "We're working very hard",
      'This should only take a minute',
      "We're testing your patience",
      'My other loading screen is much faster',
    ].sort(() => Math.random() - 0.5)
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((index) => (index + 1) % messages.length)
    }, 3000)
    return () => clearInterval(interval)
  }, [messages.length])

  return (
    <Box mt={4} mb={4} display={'flex'} flexDirection={'column'} justifyContent={'center'} alignItems={'center'}>
      <CircularProgress size={60} />
      <Typography variant={'h6'} sx={(theme) => ({ mt: 2, color: theme.palette.grey[600] })}>
        {messages[index]}
      </Typography>
    </Box>
  )
}
