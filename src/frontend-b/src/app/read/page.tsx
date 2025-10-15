"use client"

import { useState } from "react"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Folder, File, ChevronRight, ChevronDown } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

// 模拟文件结构数据
const mockFileTree = [
  {
    name: "configs",
    type: "folder",
    children: [
      {
        name: "steady-state-001.yaml",
        type: "file",
        content: {
          name: "稳态分析配置",
          type: "steady-state",
          parameters: {
            timeStep: 0.01,
            duration: 10.0,
            tolerance: 0.000001,
          },
        },
      },
      {
        name: "transient-002.yaml",
        type: "file",
        content: {
          name: "瞬态分析配置",
          type: "transient",
          parameters: {
            timeStep: 0.001,
            duration: 5.0,
            tolerance: 0.00001,
          },
        },
      },
    ],
  },
  {
    name: "results",
    type: "folder",
    children: [
      {
        name: "simulation-2024-01.yaml",
        type: "file",
        content: {
          name: "仿真结果 2024-01",
          status: "completed",
          runtime: "125.3s",
          convergence: true,
        },
      },
      {
        name: "simulation-2024-02.yaml",
        type: "file",
        content: {
          name: "仿真结果 2024-02",
          status: "completed",
          runtime: "98.7s",
          convergence: true,
        },
      },
    ],
  },
  {
    name: "templates",
    type: "folder",
    children: [
      {
        name: "default-template.yaml",
        type: "file",
        content: {
          name: "默认模板",
          type: "template",
          version: "1.0",
        },
      },
    ],
  },
]

interface FileNode {
  name: string
  type: string
  children?: FileNode[]
  content?: any
}

function FileTreeNode({
  node,
  level = 0,
  onFileClick,
}: {
  node: FileNode
  level?: number
  onFileClick: (content: any, name: string) => void
}) {
  const [isOpen, setIsOpen] = useState(level === 0)

  if (node.type === "folder") {
    return (
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="flex items-center gap-2 py-1.5 px-2 hover:bg-muted rounded-md w-full text-left">
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <Folder className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-medium">{node.name}</span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="ml-4 border-l pl-2 mt-1">
            {node.children?.map((child, index) => (
              <FileTreeNode key={index} node={child} level={level + 1} onFileClick={onFileClick} />
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    )
  }

  return (
    <button
      onClick={() => onFileClick(node.content, node.name)}
      className="flex items-center gap-2 py-1.5 px-2 hover:bg-muted rounded-md w-full text-left"
    >
      <div className="w-4" />
      <File className="h-4 w-4 text-gray-600" />
      <span className="text-sm">{node.name}</span>
    </button>
  )
}

export default function ReadPage() {
  const [selectedFile, setSelectedFile] = useState<{ content: any; name: string } | null>(null)

  const handleFileClick = (content: any, name: string) => {
    setSelectedFile({ content, name })
  }

  return (
    <div className="flex flex-col h-full">
      <header className="border-b">
        <div className="flex h-16 items-center px-6">
          <SidebarTrigger />
          <h1 className="text-2xl font-bold ml-4">读取</h1>
        </div>
      </header>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 文件浏览区域 */}
        <div className="flex-1 p-6 overflow-auto">
          <Card>
            <CardHeader>
              <CardTitle>文件浏览器</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-1">
                  {mockFileTree.map((node, index) => (
                    <FileTreeNode key={index} node={node} onFileClick={handleFileClick} />
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* 底部固定预览窗口 */}
        {selectedFile && (
          <>
            <Separator />
            <div className="h-64 border-t bg-background">
              <div className="h-full p-6 overflow-auto">
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle className="text-lg">文件预览: {selectedFile.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-32">
                      <pre className="text-sm bg-muted p-4 rounded-lg">
                        {JSON.stringify(selectedFile.content, null, 2)}
                      </pre>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
