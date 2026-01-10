import { Close, Check } from '@mui/icons-material'
import { IconButton } from '@mui/material'

export default function SaveCancel({
  handleSave,
  handleCancel,
  saveDisabled = false,
}: {
  handleSave: () => void
  handleCancel: () => void
  saveDisabled?: boolean
}) {
  return (
    <>
      <IconButton size={'small'} color={'warning'} sx={{ ml: 2 }} onClick={handleCancel}>
        <Close />
      </IconButton>
      <IconButton size={'small'} color={'success'} sx={{ ml: 2 }} onClick={handleSave} disabled={saveDisabled}>
        <Check />
      </IconButton>
    </>
  )
}
