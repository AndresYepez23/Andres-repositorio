// Queen's shared model lease/limits/observations may use a separate database.
// Keep provider/account storage on its existing PRISMA_RATE_DB binding.
export function queenControlDB(env){return env.QUEEN_CONTROL_DB||env.PRISMA_RATE_DB;}
