// if delete? duplicated name with file in GUI
import { lazy, Suspense } from 'react';

interface Props {
  componentPath: string;
}

export default function PluginLoader({ componentPath }: Props) {
  // 动态导入插件组件
  const PluginComponent = lazy(() => import(`../plugins/${componentPath}`));

  return (
    <Suspense fallback={<div>Loading plugin...</div>}>
      <PluginComponent />
    </Suspense>
  );
}
