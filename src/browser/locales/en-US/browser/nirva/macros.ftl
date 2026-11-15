# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

## Macros page

nirva-macros-title = Macros
nirva-macros-eyebrow = Browser actions
nirva-macros-intro = A macro runs several browser actions in order. Run one here or from the command bar (Ctrl+K). Steps that cannot be undone ask first, and a running macro can be stopped.
nirva-macros-new = New macro
nirva-macros-list-title = Your macros
nirva-macros-list-empty = No macros yet. Make one with the form beside this list.
# $count (Number) - Number of steps in the macro.
nirva-macros-step-count =
    { $count ->
        [one] 1 step
       *[other] { $count } steps
    }
# $name (String) - The macro's name.
nirva-macros-run = Run
    .aria-label = Run { $name }
# $name (String) - The macro's name.
nirva-macros-edit = Edit
    .aria-label = Edit { $name }
# $name (String) - The macro's name.
nirva-macros-delete = Delete
    .aria-label = Delete { $name }
# $name (String) - The macro's name.
nirva-macros-delete-confirm = Delete the macro “{ $name }”?
nirva-macros-editor-new = New macro
nirva-macros-editor-edit = Edit macro
nirva-macros-name = Name
nirva-macros-steps-empty = Add the first step below.
# $step (Number) - Position of the step in the macro.
nirva-macros-step-number = Step { $step }
nirva-macros-asks-first = Asks first
# $step (Number) - Position of the step in the macro.
nirva-macros-step-up = Up
    .aria-label = Move step { $step } up
# $step (Number) - Position of the step in the macro.
nirva-macros-step-down = Down
    .aria-label = Move step { $step } down
# $step (Number) - Position of the step in the macro.
nirva-macros-step-remove = Remove
    .aria-label = Remove step { $step }
nirva-macros-choice =
    .aria-label = Step to add
nirva-macros-url =
    .placeholder = Address, such as example.com
    .aria-label = Site address
nirva-macros-add-step = Add step
nirva-macros-cancel = Clear
nirva-macros-save = Save macro

## Steps that are not Nirva commands

# $url (String) - The web address the step opens.
nirva-macros-step-open = Open { $url } in a new tab
nirva-macros-choice-open = Open a site in a new tab
nirva-macros-step-sleep-others = Put the other tabs in this workspace to sleep
nirva-macros-step-close-others = Close the other tabs in this workspace

## Running

# $name (String) - The macro's name.
# $step (Number) - Position of the running step.
# $count (Number) - Number of steps in the macro.
# $title (String) - What the step does.
nirva-macros-running = Macro “{ $name }”, step { $step } of { $count }: { $title }
nirva-macros-stop = Stop
# $name (String) - The macro's name.
nirva-macros-stopped = Macro “{ $name }” was stopped. Steps already done stay done.
# $name (String) - The macro's name.
# $step (Number) - Position of the step that failed.
# $title (String) - What the step does.
# $reason (String) - Why it failed.
nirva-macros-failed = Macro “{ $name }” stopped at step { $step }, “{ $title }”: { $reason }
# $name (String) - The macro's name.
nirva-macros-confirm-title = Run “{ $name }”?
# $steps (String) - One line per step that cannot be undone.
nirva-macros-confirm-text =
    This macro includes steps that cannot be undone:
    { $steps }

## Errors

nirva-macros-error-name = Give the macro a name.
nirva-macros-error-steps = Add at least one step.
nirva-macros-error-too-many = A macro can have at most 12 steps.
nirva-macros-error-full = You have the most macros allowed. Delete one first.
nirva-macros-error-address = Enter a web address, such as example.com.
nirva-macros-error-gone = this action is no longer available, for example because its workspace was deleted.
nirva-macros-error-unknown = the action did not complete.
