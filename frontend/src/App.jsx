import './App.css'

const occasions = [
  { id: 1, slug: 'graduation', name_ar: 'توزيعات تخرج', name_en: 'Graduation' },
  { id: 2, slug: 'wedding', name_ar: 'توزيعات خطوبة أو زواج', name_en: 'Wedding' },
  { id: 3, slug: 'baby', name_ar:'توزيعات بيبي', name_en: 'Baby'},
]

function App() {
  return (
    <div dir="rtl">
      <h1>Deniz</h1>
      <p>شموع معطّرة مصنوعة بحب، لتكون جزء من مناسبتك</p>
      <h2>توزيعات</h2>
      <ul>
        {occasions.map(occasion => (
          <li key={occasion.id}>
            <h3>{occasion.name_ar}</h3>
            <p>{occasion.name_en}</p>
          </li>
        ))}
      </ul>
      <h2>هدايا شمع</h2>
    </div>
  )
}

export default App
