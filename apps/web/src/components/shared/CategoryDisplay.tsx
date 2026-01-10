import { Category } from '@/graphql/types'
import { Box, Chip } from '@mui/material'
import { useTranslations } from 'next-intl'

export default function CategoryDisplay({
  categories,
  handleDelete,
}: {
  categories: Category[]
  handleDelete?: (category: Category) => void
}) {
  const t = useTranslations('common')

  return (
    <Box>
      {categories.length === 0 && (
        <Chip
          label={t('transactions.noCategory')}
          clickable={false}
          size={'small'}
          sx={{ mr: 2, mt: 1, mb: 1 }}
          variant={'outlined'}
        />
      )}
      {categories.length > 0 &&
        categories.map((category, i) => (
          <Chip
            key={category.nodeId}
            label={category.name}
            size={'small'}
            onDelete={handleDelete && (() => handleDelete(categories[i]))}
            sx={{ mr: 2, mt: 1, mb: 1 }}
          />
        ))}
    </Box>
  )
}
