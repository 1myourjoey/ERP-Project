interface PageSkeletonProps {
  type: 'dashboard' | 'table' | 'form' | 'detail'
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="skeleton h-16" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => <div key={index} className="skeleton h-24" />)}
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="skeleton h-56" />
        <div className="skeleton h-56" />
      </div>
    </div>
  )
}

function TableSkeleton() {
  return (
    <div className="space-y-2">
      <div className="skeleton h-10" />
      {Array.from({ length: 8 }).map((_, index) => <div key={index} className="skeleton h-11" />)}
    </div>
  )
}

function FormSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="space-y-1">
          <div className="skeleton h-4 w-24" />
          <div className="skeleton h-10" />
        </div>
      ))}
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="space-y-3">
      <div className="skeleton h-10" />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => <div key={index} className="skeleton h-40" />)}
      </div>
    </div>
  )
}

export function PageSkeleton({ type }: PageSkeletonProps) {
  return (
    <div className="page-container">
      {type === 'dashboard' && <DashboardSkeleton />}
      {type === 'table' && <TableSkeleton />}
      {type === 'form' && <FormSkeleton />}
      {type === 'detail' && <DetailSkeleton />}
    </div>
  )
}

export default PageSkeleton
