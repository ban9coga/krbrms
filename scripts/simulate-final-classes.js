const resolveDefaultAdvancedRace = (totalRiders) => {
  if (totalRiders <= 8) {
    return {
      stages: { enableQualification: false, enableQuarterFinal: false, enableSemiFinal: false },
      finalClasses: ['ELITE'],
    }
  }

  if (totalRiders <= 16) {
    return {
      stages: { enableQualification: true, enableQuarterFinal: false, enableSemiFinal: false },
      finalClasses: ['NOVICE', 'ELITE'],
    }
  }

  if (totalRiders <= 32) {
    return {
      stages: { enableQualification: true, enableQuarterFinal: false, enableSemiFinal: true },
      finalClasses: ['ROOKIE', 'PRO', 'NOVICE', 'ELITE'],
    }
  }

  return {
    stages: { enableQualification: true, enableQuarterFinal: true, enableSemiFinal: true },
    finalClasses: ['BEGINNER', 'AMATEUR', 'ACADEMY', 'ADVANCED', 'ROOKIE', 'PRO', 'NOVICE', 'ELITE'],
  }
}

const categories = [
  {
    name: 'U13 MIX (realista)',
    totalRiders: 12,
    assumedRule: 'default',
  },
  {
    name: 'OPEN JUNIOR (realista)',
    totalRiders: 28,
    assumedRule: 'default',
  },
]

for (const category of categories) {
  const resolved = resolveDefaultAdvancedRace(category.totalRiders)
  console.log(`Category: ${category.name}`)
  console.log(`  totalRiders: ${category.totalRiders}`)
  console.log(`  stages:`)
  console.log(`    enableQualification: ${resolved.stages.enableQualification}`)
  console.log(`    enableQuarterFinal: ${resolved.stages.enableQuarterFinal}`)
  console.log(`    enableSemiFinal: ${resolved.stages.enableSemiFinal}`)
  console.log(`  finalClasses: ${resolved.finalClasses.join(', ')}`)
  console.log('')
}
