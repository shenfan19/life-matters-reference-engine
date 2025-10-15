import Link from "next/link"
import { Settings, FolderOpen, Play, Zap } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { SidebarTrigger } from "@/components/ui/sidebar"

export default function Home() {
  const modules = [
    {
      title: "构造",
      description: "创建和编辑仿真配置文件",
      icon: Settings,
      href: "/construct",
      color: "text-blue-600",
    },
    {
      title: "读取",
      description: "浏览和查看配置文件",
      icon: FolderOpen,
      href: "/read",
      color: "text-green-600",
    },
    {
      title: "仿真",
      description: "运行仿真并查看结果",
      icon: Play,
      href: "/simulation",
      color: "text-orange-600",
    },
    {
      title: "优化",
      description: "参数优化和性能提升",
      icon: Zap,
      href: "/optimization",
      color: "text-purple-600",
    },
  ]

  return (
    <div className="flex flex-col h-full">
      <header className="border-b">
        <div className="flex h-16 items-center px-6">
          <SidebarTrigger />
          <h1 className="text-2xl font-bold ml-4">仿真系统</h1>
        </div>
      </header>

      <div className="flex-1 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <h2 className="text-3xl font-bold mb-2">欢迎使用仿真系统</h2>
            <p className="text-muted-foreground text-lg">
              一个集成构造、读取、仿真和优化功能的综合平台
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {modules.map((module) => (
              <Card key={module.title} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <module.icon className={`h-8 w-8 ${module.color}`} />
                    <div>
                      <CardTitle>{module.title}</CardTitle>
                      <CardDescription>{module.description}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Link href={module.href}>
                    <Button className="w-full">进入模块</Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
