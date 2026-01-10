'use client'

import { Category, Query } from '@/graphql/types'
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'
import { useTranslations } from 'next-intl'
import CategoryRow from '@/components/categories/CategoryRow'
import { useSuspenseQuery } from '@apollo/client/react'
// import { GET_CATEGORIES } from '@/lib/gql/categories'
import CategoryAdd from './CategoryAdd'
import { useAppContext } from '../context/AppContextProvider'
import { useMemo } from 'react'
import { GetCategoriesDocument } from '@/graphql/operations'

export default function Categories() {
  const t = useTranslations('common')
  const { user } = useAppContext()
  const query = useSuspenseQuery<Query>(GetCategoriesDocument, {
    variables: {
      userId: Number(user?.id),
    },
  })

  const categories: Category[] = useMemo(() => {
    return [...(query?.data?.allCategories?.nodes || [])]?.sort((a: Category, b: Category) => {
      if ((a.name || '') > (b.name || '')) return 1
      if ((a.name || '') < (b.name || '')) return -1
      return 0
    })
  }, [query?.data?.allCategories?.nodes])

  return (
    <>
      {!!user && <CategoryAdd user={user} />}
      {categories.length > 0 && (
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>
                  <Typography variant={'h4'} sx={{ fontWeight: 700 }}>
                    {t('shared.name')}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant={'h4'} sx={{ fontWeight: 700 }}>
                    {t('categories.regex')}
                  </Typography>
                </TableCell>
                <TableCell align={'right'}>
                  <Typography variant={'h4'} sx={{ fontWeight: 700 }}>
                    {t('shared.created')}
                  </Typography>
                </TableCell>
                <TableCell align={'right'}>
                  <Typography variant={'h4'} sx={{ fontWeight: 700 }}>
                    {t('shared.group')}
                  </Typography>
                </TableCell>
                <TableCell align={'right'}>
                  <Typography variant={'h4'} sx={{ fontWeight: 700 }}>
                    {t('shared.actions')}
                  </Typography>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {categories.map((category) => (
                <CategoryRow key={category.nodeId} category={category} user={user} />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </>
  )
}
