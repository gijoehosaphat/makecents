import type { ApolloCache, DocumentNode, OperationVariables } from '@apollo/client'
import { CombinedGraphQLErrors } from '@apollo/client'
import { useMutation } from '@apollo/client/react'
import type { TypedDocumentNode } from '@graphql-typed-document-node/core'
import { useSnackbar } from 'notistack'
import { useTranslations } from 'next-intl'

type ToastOptions = {
  /** Shown instead of the generic message, e.g. one that names what failed. */
  errorMessage?: string
  /** Show the API's own message for GraphQL errors, e.g. a database rule the change broke. */
  showServerMessage?: boolean
  /** Set to false when the caller reports the failure itself (inline error, one message for a multi-step flow). */
  reportErrors?: boolean
}

/**
 * `useMutation` that tells the user when a save fails, so every mutation reports errors the same way.
 * The promise still rejects so callers can stop what they were doing.
 */
export function useMutationWithToast<
  TData = unknown,
  TVariables extends OperationVariables = OperationVariables,
  TCache extends ApolloCache = ApolloCache,
>(
  mutation: DocumentNode | TypedDocumentNode<TData, TVariables>,
  {
    errorMessage,
    showServerMessage,
    reportErrors = true,
    onError,
    ...options
  }: useMutation.Options<NoInfer<TData>, NoInfer<TVariables>, TCache> & ToastOptions = {},
) {
  const t = useTranslations('common')
  const { enqueueSnackbar } = useSnackbar()

  return useMutation<TData, TVariables, TCache>(mutation, {
    ...options,
    onError: (error, clientOptions) => {
      console.error(error)
      onError?.(error, clientOptions)
      if (reportErrors && !onError) {
        const message = showServerMessage && CombinedGraphQLErrors.is(error) ? error.message : errorMessage
        enqueueSnackbar(message || t('shared.saveError'), { variant: 'error' })
      }
    },
  })
}
