"use client"

import { useState } from "react"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Save, Download } from "lucide-react"
import yaml from "js-yaml"

export default function ConstructPage() {
  const [formData, setFormData] = useState({
    name: "",
    type: "",
    description: "",
    parameters: {
      timeStep: "",
      duration: "",
      tolerance: "",
    },
    initialConditions: "",
    boundaryConditions: "",
  })

  const [savedYaml, setSavedYaml] = useState("")

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleParameterChange = (param: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      parameters: {
        ...prev.parameters,
        [param]: value,
      },
    }))
  }

  const handleSave = () => {
    try {
      const yamlString = yaml.dump(formData)
      setSavedYaml(yamlString)
      alert("配置已保存为 YAML 格式")
    } catch (error) {
      alert("保存失败: " + error)
    }
  }

  const handleDownload = () => {
    if (!savedYaml) {
      alert("请先保存配置")
      return
    }

    const blob = new Blob([savedYaml], { type: "text/yaml" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${formData.name || "config"}.yaml`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col h-full">
      <header className="border-b">
        <div className="flex h-16 items-center px-6">
          <SidebarTrigger />
          <h1 className="text-2xl font-bold ml-4">构造</h1>
        </div>
      </header>

      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>创建仿真配置</CardTitle>
              <CardDescription>填写以下信息以创建新的仿真配置文件</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">配置名称</Label>
                  <Input
                    id="name"
                    placeholder="输入配置名称"
                    value={formData.name}
                    onChange={(e) => handleInputChange("name", e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="type">仿真类型</Label>
                  <Select value={formData.type} onValueChange={(value) => handleInputChange("type", value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="选择类型" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="steady-state">稳态分析</SelectItem>
                      <SelectItem value="transient">瞬态分析</SelectItem>
                      <SelectItem value="harmonic">谐波分析</SelectItem>
                      <SelectItem value="modal">模态分析</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">描述</Label>
                <Textarea
                  id="description"
                  placeholder="输入仿真描述"
                  value={formData.description}
                  onChange={(e) => handleInputChange("description", e.target.value)}
                  rows={3}
                />
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold">仿真参数</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="timeStep">时间步长</Label>
                    <Input
                      id="timeStep"
                      type="number"
                      placeholder="0.01"
                      value={formData.parameters.timeStep}
                      onChange={(e) => handleParameterChange("timeStep", e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="duration">仿真时长</Label>
                    <Input
                      id="duration"
                      type="number"
                      placeholder="10.0"
                      value={formData.parameters.duration}
                      onChange={(e) => handleParameterChange("duration", e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="tolerance">收敛容差</Label>
                    <Input
                      id="tolerance"
                      type="number"
                      placeholder="1e-6"
                      value={formData.parameters.tolerance}
                      onChange={(e) => handleParameterChange("tolerance", e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="initialConditions">初始条件</Label>
                <Textarea
                  id="initialConditions"
                  placeholder="输入初始条件（一行一个）"
                  value={formData.initialConditions}
                  onChange={(e) => handleInputChange("initialConditions", e.target.value)}
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="boundaryConditions">边界条件</Label>
                <Textarea
                  id="boundaryConditions"
                  placeholder="输入边界条件（一行一个）"
                  value={formData.boundaryConditions}
                  onChange={(e) => handleInputChange("boundaryConditions", e.target.value)}
                  rows={4}
                />
              </div>

              <div className="flex gap-3">
                <Button onClick={handleSave} className="flex-1">
                  <Save className="mr-2 h-4 w-4" />
                  保存配置
                </Button>
                <Button onClick={handleDownload} variant="outline" className="flex-1">
                  <Download className="mr-2 h-4 w-4" />
                  下载 YAML
                </Button>
              </div>
            </CardContent>
          </Card>

          {savedYaml && (
            <Card>
              <CardHeader>
                <CardTitle>YAML 预览</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="bg-muted p-4 rounded-lg overflow-auto max-h-96 text-sm">
                  {savedYaml}
                </pre>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
