import { redirect } from 'next/navigation'

export default async function AssociationTeamPage({
  params,
}: {
  params: Promise<{ tenancy: string }>
}) {
  const { tenancy } = await params
  redirect(`/app/${tenancy}/association-team/property-log`)
}
