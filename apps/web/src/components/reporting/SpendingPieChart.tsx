import { Box } from '@mui/material'
import { PieChart, Pie, Sector, Cell, ResponsiveContainer, Legend } from 'recharts'
import { generateGradient } from 'typescript-color-gradient'

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042']

const RADIAN = Math.PI / 180
const renderCustomizedLabel = ({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
  index,
}: {
  cx: number
  cy: number
  midAngle: number
  innerRadius: number
  outerRadius: number
  percent: number
  index: number
}) => {
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)

  return (
    <text x={x} y={y} fill="white" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central">
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  )
}

export function SpendingPieChart({ data }: { data: { label: string; value: number }[] }) {
  const gradientArray = generateGradient(['#3F2CAF', '#e9446a', '#edc988', '#607D8B'], data.length)

  let spending = data
    .filter((category) => category.value <= 0)
    .map((category) => ({
      ...category,
      value: Math.abs(category.value),
    }))

  return (
    <Box sx={{ width: 400, height: 400 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart width={400} height={400}>
          <Pie
            data={spending}
            cx="50%"
            cy="50%"
            labelLine={false}
            // label
            // label={renderCustomizedLabel}
            outerRadius={150}
            fill="#8884d8"
            dataKey="value"
          >
            <Legend />
            {spending.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={gradientArray[index]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </Box>
  )
}
