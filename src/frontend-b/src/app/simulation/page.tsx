"use client"

import { useState, useEffect } from "react"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Play, Pause, Square } from "lucide-react"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"

export default function SimulationPage() {
  const [isRunning, setIsRunning] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [simulationData, setSimulationData] = useState<any[]>([])
  const [outputText, setOutputText] = useState("")

  const [inputParams, setInputParams] = useState({
    amplitude: "10",
    frequency: "1",
    damping: "0.1",
    duration: "10",
  })

  useEffect(() => {
    let interval: NodeJS.Timeout
    if (isRunning && !isPaused) {
      let time = simulationData.length > 0 ? simulationData[simulationData.length - 1].time : 0

      interval = setInterval(() => {
        const amp = parseFloat(inputParams.amplitude) || 10
        const freq = parseFloat(inputParams.frequency) || 1
        const damp = parseFloat(inputParams.damping) || 0.1

        time += 0.1
        const value1 = amp * Math.sin(2 * Math.PI * freq * time) * Math.exp(-damp * time)
        const value2 = amp * 0.8 * Math.cos(2 * Math.PI * freq * time) * Math.exp(-damp * time)

        setSimulationData((prev) => [
          ...prev,
          {
            time: parseFloat(time.toFixed(2)),
            signal1: parseFloat(value1.toFixed(2)),
            signal2: parseFloat(value2.toFixed(2)),
          },
        ])

        setOutputText(
          (prev) => `${prev}\n时刻 ${time.toFixed(2)}s: 信号1=${value1.toFixed(3)}, 信号2=${value2.toFixed(3)}`
        )

        const duration = parseFloat(inputParams.duration) || 10
        if (time >= duration) {
          setIsRunning(false)
          setOutputText((prev) => `${prev}\n\n仿真完成！`)
        }
      }, 100)
    }

    return () => clearInterval(interval)
  }, [isRunning, isPaused, simulationData, inputParams])

  const handleStart = () => {
    if (!isRunning) {
      setSimulationData([])
      setOutputText("仿真开始...\n")
    }
    setIsRunning(true)
    setIsPaused(false)
  }

  const handlePause = () => {
    setIsPaused(!isPaused)
    setOutputText((prev) => `${prev}\n${isPaused ? "仿真继续..." : "仿真暂停..."}`)
  }

  const handleStop = () => {
    setIsRunning(false)
    setIsPaused(false)
    setOutputText((prev) => `${prev}\n仿真已停止`)
  }

  return (
    <div className="flex flex-col h-full">
      <header className="border-b">
        <div className="flex h-16 items-center px-6">
          <SidebarTrigger />
          <h1 className="text-2xl font-bold ml-4">仿真</h1>
        </div>
      </header>

      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* 输入参数 */}
          <Card>
            <CardHeader>
              <CardTitle>输入参数</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="amplitude">振幅</Label>
                  <Input
                    id="amplitude"
                    type="number"
                    value={inputParams.amplitude}
                    onChange={(e) => setInputParams({ ...inputParams, amplitude: e.target.value })}
                    disabled={isRunning}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="frequency">频率 (Hz)</Label>
                  <Input
                    id="frequency"
                    type="number"
                    value={inputParams.frequency}
                    onChange={(e) => setInputParams({ ...inputParams, frequency: e.target.value })}
                    disabled={isRunning}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="damping">阻尼系数</Label>
                  <Input
                    id="damping"
                    type="number"
                    value={inputParams.damping}
                    onChange={(e) => setInputParams({ ...inputParams, damping: e.target.value })}
                    disabled={isRunning}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="duration">时长 (s)</Label>
                  <Input
                    id="duration"
                    type="number"
                    value={inputParams.duration}
                    onChange={(e) => setInputParams({ ...inputParams, duration: e.target.value })}
                    disabled={isRunning}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 控制按钮 */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex gap-4 justify-center">
                <Button onClick={handleStart} disabled={isRunning && !isPaused} size="lg" className="w-32">
                  <Play className="mr-2 h-4 w-4" />
                  {isRunning ? "运行中" : "开始"}
                </Button>
                <Button
                  onClick={handlePause}
                  disabled={!isRunning}
                  variant="outline"
                  size="lg"
                  className="w-32"
                >
                  <Pause className="mr-2 h-4 w-4" />
                  {isPaused ? "继续" : "暂停"}
                </Button>
                <Button
                  onClick={handleStop}
                  disabled={!isRunning}
                  variant="destructive"
                  size="lg"
                  className="w-32"
                >
                  <Square className="mr-2 h-4 w-4" />
                  停止
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 曲线图表 */}
          <Card>
            <CardHeader>
              <CardTitle>仿真曲线</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={simulationData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" label={{ value: "时间 (s)", position: "insideBottom", offset: -5 }} />
                  <YAxis label={{ value: "幅值", angle: -90, position: "insideLeft" }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="signal1" stroke="#3b82f6" name="信号 1" dot={false} />
                  <Line type="monotone" dataKey="signal2" stroke="#ef4444" name="信号 2" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* 文本输出 */}
          <Card>
            <CardHeader>
              <CardTitle>输出日志</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={outputText}
                readOnly
                className="font-mono text-sm h-48"
                placeholder="仿真输出将显示在这里..."
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
