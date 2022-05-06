import {
  ColumnFilter,
  FilterFn,
  ResolvedColumnFilter,
} from '../features/Filters'
import { TableInstance, RowModel, TableGenerics, Row } from '../types'
import { memo } from '../utils'
import { filterRows } from './filterRowsUtils'

export function getFilteredRowModelSync<TGenerics extends TableGenerics>(): (
  instance: TableInstance<TGenerics>
) => () => RowModel<TGenerics> {
  return instance =>
    memo(
      () => [
        instance.getPreFilteredRowModel(),
        instance.getState().columnFilters,
        instance.getState().globalFilter,
      ],
      (rowModel, columnFilters, globalFilter) => {
        if (
          !rowModel.rows.length ||
          (!columnFilters?.length && !globalFilter)
        ) {
          return rowModel
        }

        const resolvedColumnFilters: ResolvedColumnFilter<TGenerics>[] = []
        const resolvedGlobalFilters: ResolvedColumnFilter<TGenerics>[] = []

        ;(columnFilters ?? []).forEach(d => {
          const column = instance.getColumn(d.id)

          if (!column) {
            if (process.env.NODE_ENV !== 'production') {
              console.warn(
                `Table: Could not find a column to filter with columnId: ${d.id}`
              )
            }
          }

          const filterFn = column.getFilterFn()

          if (!filterFn) {
            if (process.env.NODE_ENV !== 'production') {
              console.warn(
                `Could not find a valid 'column.filterFn' for column with the ID: ${column.id}.`
              )
            }
            return
          }

          resolvedColumnFilters.push({
            id: d.id,
            filterFn,
            resolvedValue: filterFn.resolveFilterValue?.(d.value) ?? d.value,
          })
        })

        const filterableIds = columnFilters.map(d => d.id)

        const globalFilterFn = instance.getGlobalFilterFn()

        const globallyFilterableColumns = instance
          .getAllLeafColumns()
          .filter(column => column.getCanGlobalFilter())

        if (
          globalFilter &&
          globalFilterFn &&
          globallyFilterableColumns.length
        ) {
          filterableIds.push('__global__')

          globallyFilterableColumns.forEach(column => {
            resolvedGlobalFilters.push({
              id: column.id,
              filterFn: globalFilterFn,
              resolvedValue:
                globalFilterFn.resolveFilterValue?.(globalFilter) ??
                globalFilter,
            })
          })
        }

        // Flag the prefiltered row model with each filter state
        for (let j = 0; j < rowModel.flatRows.length; j++) {
          const row = rowModel.flatRows[j]

          row.columnFilterMap = {}

          if (resolvedColumnFilters.length) {
            for (let i = 0; i < resolvedColumnFilters.length; i++) {
              const columnFilter = resolvedColumnFilters[i]

              // Tag the row with the column filter state
              row.columnFilterMap[columnFilter.id] = columnFilter.filterFn(
                row,
                columnFilter.id,
                columnFilter.resolvedValue
              )
            }
          }

          if (resolvedGlobalFilters.length) {
            for (let i = 0; i < resolvedGlobalFilters.length; i++) {
              const globalFilter = resolvedGlobalFilters[i]
              // Tag the row with the first truthy global filter state
              if (
                globalFilter.filterFn(
                  row,
                  globalFilter.id,
                  globalFilter.resolvedValue
                )
              ) {
                row.columnFilterMap.__global__ = true
                break
              }
            }

            if (row.columnFilterMap.__global__ !== true) {
              row.columnFilterMap.__global__ = false
            }
          }
        }

        // Filter final rows using all of the active filters
        return filterRows(rowModel.rows, filterableIds, instance)
      },
      {
        key:
          process.env.NODE_ENV === 'development' && 'getFilteredRowModelSync',
        debug: () => instance.options.debugAll ?? instance.options.debugTable,
        onChange: () => {
          instance.queue(() => {
            instance._autoResetPageIndex()
          })
        },
      }
    )
}