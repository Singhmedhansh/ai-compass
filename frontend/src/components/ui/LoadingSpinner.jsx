function LoadingSpinner() {
  return (
    <div className="flex w-full items-center justify-center py-12" role="status" aria-label="Loading">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600 dark:border-indigo-900 dark:border-t-indigo-400" />
    </div>
  )
}

export default LoadingSpinner
