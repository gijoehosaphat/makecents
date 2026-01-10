'use client'

import { CustomCategoryGroup, Query } from '@/graphql/types'
import { useTranslations } from 'next-intl'
import { useSuspenseQuery } from '@apollo/client/react'
import { useAppContext } from '../context/AppContextProvider'
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'
import { useMemo } from 'react'
import { GetCustomCategoryGroups, GetCustomCategoryGroupsDocument } from '@/graphql/operations'
import GroupRow from './GroupRow'
import GroupAdd from './GroupAdd'

export default function Groups() {
  const t = useTranslations('common')
  const { currentAccountId } = useAppContext()

  const query = useSuspenseQuery<Query>(GetCustomCategoryGroupsDocument, {
    variables: {
      accountId: currentAccountId,
    },
  })

  const groups: CustomCategoryGroup[] = useMemo(() => {
    return [...(query?.data?.allCustomCategoryGroups?.nodes || [])]?.sort(
      (a: CustomCategoryGroup, b: CustomCategoryGroup) => {
        if ((a.name || '') > (b.name || '')) return 1
        if ((a.name || '') < (b.name || '')) return -1
        return 0
      }
    )
  }, [query?.data?.allCustomCategoryGroups?.nodes])

  return (
    <>
      {currentAccountId && <GroupAdd accountId={currentAccountId} />}
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>
                <Typography variant={'h4'} sx={{ fontWeight: 700 }}>
                  {t('shared.name')}
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
            {groups.map((group) => (
              <GroupRow key={group.nodeId} group={group} accountId={currentAccountId} />
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  )
}
