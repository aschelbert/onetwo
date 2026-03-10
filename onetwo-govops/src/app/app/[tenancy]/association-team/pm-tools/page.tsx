import { Card, CardBody } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Wrench } from 'lucide-react'

export default function PMToolsPage() {
  return (
    <div className="flex items-center justify-center py-20">
      <Card className="max-w-md w-full text-center">
        <CardBody className="py-12">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <Wrench size={24} className="text-[#929da8]" />
          </div>
          <h2 className="text-lg font-bold text-[#1a1f25] mb-2">PM Tools</h2>
          <p className="text-sm text-[#45505a] mb-4">
            Property manager utilities including templates, checklists, and operational tools.
          </p>
          <Badge variant="gray">Coming Soon</Badge>
        </CardBody>
      </Card>
    </div>
  )
}
